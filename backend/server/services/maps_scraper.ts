import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BusinessResult {
    name: string;
    address: string;
    website?: string;
    phone?: string;
    email?: string | null;
    rating?: number;
    place_id: string;
    types: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_VALID_LEADS = 10;
const MAX_LINKS = 15;
const FETCH_TIMEOUT_MS = 15000;
const PAGE_TIMEOUT_MS = 30000;

const FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
};

// ─── AI Rate Limiting ─────────────────────────────────────────────────────────

let lastAiCallTime = 0;
const MIN_AI_DELAY_MS = 2000;
let aiLockPromise: Promise<void> = Promise.resolve();

async function withAiLock<T>(fn: () => Promise<T>): Promise<T> {
    let resolve!: () => void;
    const prev = aiLockPromise;
    aiLockPromise = new Promise<void>(r => (resolve = r));
    await prev;
    try {
        const now = Date.now();
        const wait = MIN_AI_DELAY_MS - (now - lastAiCallTime);
        if (wait > 0) await sleep(wait);
        return await fn();
    } finally {
        lastAiCallTime = Date.now();
        resolve();
    }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

function toRad(deg: number) { return (deg * Math.PI) / 180; }

function cleanBusinessName(name: string): string {
    if (!name) return '';
    const separators = [' | ', ' - ', ' – ', ' : ', ' — ', ' • ', '|'];
    let cleaned = name;
    for (const sep of separators) {
        if (cleaned.includes(sep)) {
            const potential = cleaned.split(sep)[0].trim();
            if (potential.length > 2) { cleaned = potential; break; }
        }
    }
    const descriptive = ['digital marketing', 'website designing', 'web design', 'software company', 'it services', 'consultancy', 'seo agency', 'social media', 'agency', 'company'];
    const lower = cleaned.toLowerCase();
    for (const phrase of descriptive) {
        const idx = lower.indexOf(phrase);
        if (idx > 3) {
            cleaned = cleaned.slice(0, idx).replace(/[\s\-|:.\/–—•]+$/, '').trim();
        }
    }
    return cleaned.trim();
}

function isExpiredOrParked(html: string): boolean {
    const lower = html.toLowerCase();
    const expired = ['domain is expired', 'domain has expired', 'renew your domain', 'this domain is parked', 'buy this domain', 'domain is for sale', 'account suspended', 'cgi-sys/suspendedpage.cgi'];
    const parking = ['sedo.com/search/details.php', 'parking.godaddy.com', 'hugeDomains.com', 'afternic.com/domain/', 'hostinger-page.png'];
    return expired.some(k => lower.includes(k)) || parking.some(s => lower.includes(s.toLowerCase()));
}

function cfDecodeEmail(encoded: string): string | null {
    try {
        const r = parseInt(encoded.slice(0, 2), 16);
        let email = '';
        for (let i = 2; i < encoded.length; i += 2) {
            email += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ r);
        }
        return email;
    } catch { return null; }
}

function cleanEmail(raw: string | null | undefined): string | null {
    if (!raw || !raw.includes('@')) return null;
    let email = raw.toLowerCase().trim()
        .replace(/\[at\]/g, '@').replace(/\(at\)/g, '@')
        .replace(/\[dot\]/g, '.').replace(/\(dot\)/g, '.')
        .replace(/^(u003e|u003ae|u003c|mailto:)/, '')
        .split('?')[0].split('#')[0];
    if (email.length < 5 || email.length > 100) return null;
    return email;
}

const INVALID_DOMAINS = ['example.com', 'domain.com', 'email.com', 'yoursite.com', 'test.com', 'company.com', 'wixpress.com', 'sentry.io', 'wordpress.com'];
const INVALID_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js'];
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function extractEmailsFromHtml(html: string): Set<string> {
    const $ = cheerio.load(html);
    const found = new Set<string>();

    // Method 1: mailto: links
    $('a[href^="mailto:"]').each((_, el) => {
        const e = cleanEmail($(el).attr('href')!.replace('mailto:', ''));
        if (e) found.add(e);
    });

    // Method 2: Cloudflare obfuscated
    $('.__cf_email__').each((_, el) => {
        const encoded = $(el).attr('data-cfemail');
        if (encoded) { const e = cleanEmail(cfDecodeEmail(encoded)); if (e) found.add(e); }
    });

    // Method 3: schema.org JSON-LD
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const findEmails = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                for (const [k, v] of Object.entries(obj)) {
                    if (k === 'email' && typeof v === 'string') {
                        const e = cleanEmail(v); if (e) found.add(e);
                    } else { findEmails(v); }
                }
            };
            findEmails(JSON.parse($(el).html() || '{}'));
        } catch { }
    });

    // Method 4: Regex on raw html + text
    const sources = [html, $.text()];
    for (const src of sources) {
        const matches = src.match(EMAIL_RE) || [];
        for (const m of matches) {
            const e = cleanEmail(m);
            if (!e) continue;
            const domain = e.split('@')[1] || '';
            if (INVALID_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) continue;
            if (INVALID_EXTS.includes(e.split('.').pop()!)) continue;
            found.add(e);
        }
    }
    return found;
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        const resp = await fetch(url, { headers: FETCH_HEADERS, signal: ctrl.signal });
        clearTimeout(timer);
        if (!resp.ok) return null;
        const html = await resp.text();
        if (isExpiredOrParked(html)) return 'EXPIRED';
        return html;
    } catch { return null; }
}

// ─── AI Extraction ────────────────────────────────────────────────────────────

async function extractWithAI(html: string, businessName: string, websiteUrl: string): Promise<string | null> {
    const keysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);
    if (!keys.length) return null;

    const snippet = html.slice(0, 8000);
    const prompt = `Extract the contact email for "${businessName}" from this website HTML.\nWebsite: ${websiteUrl}\n\nReturn ONLY:\nEMAIL: email@example.com\n\nIf not found:\nEMAIL: none\n\nHTML:\n${snippet}`;

    return withAiLock(async () => {
        for (const apiKey of keys) {
            try {
                const ai = new GoogleGenAI({ apiKey });
                const resp = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
                const text = resp.text || '';
                const match = text.match(/EMAIL:\s*([^\s]+)/i);
                if (match && match[1] !== 'none' && match[1].includes('@')) {
                    const email = cleanEmail(match[1]);
                    if (email) {
                        console.log(`[AI] Found email for ${businessName}: ${email}`);
                        return email;
                    }
                }
                return null;
            } catch (e: any) {
                const msg = String(e?.message || e);
                if (msg.includes('429') || msg.includes('403') || msg.includes('Quota')) {
                    continue; // try next key
                }
                return null;
            }
        }
        return null;
    });
}

// ─── Email Scraping ───────────────────────────────────────────────────────────

async function scrapeEmail(
    context: BrowserContext,
    websiteUrl: string,
    businessName: string,
    keyword: string
): Promise<string | null> {
    if (!websiteUrl) return null;
    if (!websiteUrl.startsWith('http')) websiteUrl = 'https://' + websiteUrl;

    try {
        const html = await fetchHtml(websiteUrl);
        if (html === 'EXPIRED') return 'REJECT_EXPIRED';
        if (html) {
            // WhatsApp/SMS provider rejection
            if (keyword) {
                const waTerms = ['whatsapp', 'bulk sms', 'aixbot', 'whatsapp business api', 'whatsapp automation'];
                const isWaSearch = waTerms.some(t => keyword.toLowerCase().includes(t));
                if (!isWaSearch) {
                    const lower = html.toLowerCase();
                    const titleMatch = lower.match(/<title[^>]*>(.*?)<\/title>/si);
                    if (titleMatch && waTerms.some(t => titleMatch[1].includes(t))) return 'REJECT_UNWANTED';
                    const waCount = (lower.match(/whatsapp business api/g) || []).length;
                    if (waCount > 1 || lower.includes('aixbot') || (lower.match(/bulk sms/g) || []).length > 1) return 'REJECT_UNWANTED';
                }
            }

            let emailSet = extractEmailsFromHtml(html);

            // SPA fallback
            if (!emailSet.size) {
                const isSpa = ['id="root"', 'id="app"', 'index-', '/assets/'].some(t => html.toLowerCase().includes(t));
                if (isSpa || html.length < 3500) {
                    console.log(`[Email] SPA detected for ${businessName}, using Playwright fallback...`);
                    try {
                        const page = await context.newPage();
                        await page.goto(websiteUrl, { timeout: 15000, waitUntil: 'networkidle' });
                        const rendered = await page.content();
                        await page.close();
                        emailSet = extractEmailsFromHtml(rendered);
                    } catch { }
                }
            }

            if (emailSet.size) {
                const email = [...emailSet][0];
                console.log(`[Email] Regex found email for ${businessName}: ${email}`);
                return email;
            }

            // Deep search contact pages
            const $ = cheerio.load(html);
            const contactKeywords = ['contact', 'about', 'team', 'impressum', 'reach', 'info', 'support', 'touch'];
            const commonPaths = ['/contact', '/contact-us', '/about-us', '/about'];
            const linksToCheck: string[] = [...commonPaths.map(p => websiteUrl.replace(/\/$/, '') + p)];

            $('a[href]').each((_, el) => {
                const href = $(el).attr('href')!;
                if (contactKeywords.some(k => href.toLowerCase().includes(k))) {
                    let full: string | null = null;
                    if (href.startsWith('http')) full = href;
                    else if (!href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
                        full = websiteUrl.replace(/\/$/, '') + '/' + href.replace(/^\//, '');
                    }
                    if (full && !linksToCheck.includes(full)) linksToCheck.push(full);
                }
            });

            // Deduplicate & prioritize contact pages, limit to 5
            const unique = [...new Set(linksToCheck)].sort((a, b) =>
                (a.includes('contact') ? 0 : 1) - (b.includes('contact') ? 0 : 1)
            ).slice(0, 5);

            for (const link of unique) {
                const subHtml = await fetchHtml(link);
                if (!subHtml || subHtml === 'EXPIRED') continue;
                const emails = extractEmailsFromHtml(subHtml);
                if (emails.size) return [...emails][0];
            }

            // AI fallback
            const aiEmail = await extractWithAI(html, businessName, websiteUrl);
            if (aiEmail) return aiEmail;
        }
    } catch { }

    return null;
}

// ─── Maps Listing Scraping ────────────────────────────────────────────────────

async function scrapeListing(
    context: BrowserContext,
    url: string,
    centerLat: number | null,
    centerLng: number | null,
    radiusLimit: number,
    searchLocation: string,
    keyword: string
): Promise<BusinessResult | null> {
    let page: Page | null = null;
    try {
        page = await context.newPage();
        await page.route('**/*', route => {
            if (['image', 'stylesheet', 'font', 'media', 'other'].includes(route.request().resourceType())) {
                route.abort();
            } else {
                route.continue();
            }
        });

        await page.goto(url, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });

        // Distance check
        if (centerLat !== null && centerLng !== null) {
            const currentUrl = page.url();
            const coordMatch = currentUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
                currentUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
            if (coordMatch) {
                const bLat = parseFloat(coordMatch[1]);
                const bLng = parseFloat(coordMatch[2]);
                let dist = haversineDistance(centerLat, centerLng, bLat, bLng);
                if (dist > radiusLimit) {
                    await sleep(1000);
                    const match2 = page.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                    if (match2) dist = haversineDistance(centerLat, centerLng, parseFloat(match2[1]), parseFloat(match2[2]));
                }
                if (dist > radiusLimit) {
                    console.log(`[Maps] Discarding result out of ${radiusLimit}km range: ${dist.toFixed(1)}km away`);
                    await page.close();
                    return null;
                }
            }
        }

        try { await page.waitForSelector('h1', { timeout: 12000 }); }
        catch { await page.close(); return null; }

        const rawName = await page.locator('h1').first().innerText();
        const name = cleanBusinessName(rawName);

        // Filter educational institutions
        if (keyword) {
            const kwLower = keyword.toLowerCase();
            const nameLower = rawName.toLowerCase();
            const eduTerms = ['college', 'university', 'institute', 'school', 'academy', 'education', 'training', 'course', 'classes', 'tuition'];
            const isEduSearch = eduTerms.some(t => kwLower.includes(t));
            const isEduBiz = eduTerms.some(t => nameLower.includes(t));
            if (!isEduSearch && isEduBiz) {
                console.log(`[Maps] Discarding educational institution: ${rawName}`);
                await page.close(); return null;
            }

            // Filter B2C retail for B2B searches
            const retailTerms = ['reliance digital', 'croma', 'poorvika', 'sangeetha', 'supermarket', 'grocery', 'furniture', 'clothing', 'cctv', 'security system', 'appliances', 'mobile store', 'repair shop'];
            const b2bTerms = ['agency', 'agencies', 'software', 'marketing', 'b2b', 'it company', 'technology', 'consulting'];
            const isB2bSearch = b2bTerms.some(t => kwLower.includes(t));
            const isRetailBiz = retailTerms.some(t => nameLower.includes(t));
            if (isB2bSearch && isRetailBiz) {
                console.log(`[Maps] Discarding B2C retail for B2B search: ${rawName}`);
                await page.close(); return null;
            }
        }

        // Phone
        let phone: string | null = null;
        try {
            const phoneBtn = page.locator('button[data-item-id*="phone:"]');
            if (await phoneBtn.count() > 0) {
                const aria = await phoneBtn.first().getAttribute('aria-label');
                if (aria) {
                    const digits = aria.replace('Phone:', '').replace(/\D/g, '').replace(/^0+/, '');
                    if (digits.length >= 10) phone = digits.slice(-10);
                }
            }
        } catch { }

        // Website
        let website: string | null = null;
        try {
            const webBtn = page.locator('a[data-item-id="authority"]');
            if (await webBtn.count() > 0) website = await webBtn.first().getAttribute('href');
        } catch { }

        // Address
        let address = 'Address not found';
        try {
            const addrBtn = page.locator('button[data-item-id="address"]');
            if (await addrBtn.count() > 0) {
                const aria = await addrBtn.first().getAttribute('aria-label');
                if (aria) address = aria.replace('Address:', '').trim();
            }
        } catch { }

        // City mismatch check
        if (searchLocation && address !== 'Address not found') {
            const majorCities = ['Chennai', 'Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad'];
            for (const city of majorCities) {
                const cityRe = new RegExp(`\\b${city}\\b(?!\\s+(?:Rd|Road|Street|Cross|Nagar))`, 'i');
                if (cityRe.test(address) && !searchLocation.toLowerCase().includes(city.toLowerCase())) {
                    const parts = address.toLowerCase().split(',');
                    if (parts[parts.length - 1].includes(city.toLowerCase())) {
                        console.log(`[Maps] Discarding result from different city: ${address}`);
                        await page.close(); return null;
                    }
                }
            }
        }

        // Types
        const types: string[] = [];
        try {
            const typeEl = page.locator('button[class*="DByne"]').first();
            if (await typeEl.count() > 0) {
                const t = await typeEl.innerText();
                if (t) types.push(t);
            }
        } catch { }

        await page.close();
        return {
            name,
            address,
            phone: phone || undefined,
            website: website || undefined,
            email: null,
            place_id: 'scraped_' + name.replace(/\s/g, '_'),
            types
        };
    } catch (e) {
        try { if (page) await page.close(); } catch { }
        return null;
    }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function searchBusinesses(keyword: string, location: string, radius = '60'): Promise<BusinessResult[]> {
    const radiusKm = parseFloat(radius) || 60;
    let browser: Browser | null = null;

    try {
        browser = await chromium.launch({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions'
            ]
        });

        const context = await browser.newContext();
        const page = await context.newPage();

        // 1. Geocode
        console.log(`[Maps] Geocoding location: ${location}`);
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(location)}`, { timeout: 60000, waitUntil: 'domcontentloaded' });

        try {
            const acceptBtn = page.locator('button[aria-label="Accept all"]');
            if (await acceptBtn.isVisible({ timeout: 4000 })) await acceptBtn.click();
        } catch { }

        try { await page.waitForURL('**/@*', { timeout: 10000 }); } catch { }

        const coordMatch = page.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        let centerLat: number | null = null, centerLng: number | null = null;
        let searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(keyword + ' in ' + location)}`;

        if (coordMatch) {
            centerLat = parseFloat(coordMatch[1]);
            centerLng = parseFloat(coordMatch[2]);
            const zoom = radiusKm < 50 ? '10z' : '9z';
            searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(keyword + ' ' + location)}/@${coordMatch[1]},${coordMatch[2]},${zoom}`;
        }

        console.log(`[Maps] Search URL: ${searchUrl}`);
        await page.goto(searchUrl, { timeout: 60000, waitUntil: 'domcontentloaded' });

        try { await page.waitForSelector('div[role="feed"]', { timeout: 5000 }); }
        catch { try { await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 5000 }); } catch { } }

        // Scroll to load more results
        try {
            const feed = page.locator('div[role="feed"]').first();
            if (await feed.count() > 0) {
                for (let i = 0; i < 4; i++) {
                    await feed.evaluate(n => { (n as HTMLElement).scrollTop = (n as HTMLElement).scrollHeight; });
                    await sleep(200);
                }
            }
        } catch { }

        // 2. Collect listing URLs
        const linksToVisit: string[] = [];
        if (page.url().includes('/maps/place/')) {
            linksToVisit.push(page.url());
        } else {
            const listings = await page.locator('a[href*="/maps/place/"]').all();
            for (const listing of listings) {
                const href = await listing.getAttribute('href');
                if (!href) continue;

                if (centerLat !== null && centerLng !== null) {
                    const m = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                    if (m && haversineDistance(centerLat, centerLng, parseFloat(m[1]), parseFloat(m[2])) > radiusKm) continue;
                }

                linksToVisit.push(href);
                if (linksToVisit.length >= MAX_LINKS) break;
            }
        }
        await page.close();

        console.log(`[Maps] Found ${linksToVisit.length} candidate listings. Starting extraction...`);

        // 3. Concurrent extraction
        console.log(`[Maps] Starting concurrent extraction for ${linksToVisit.length} listings...`);
        const results: BusinessResult[] = [];
        let validCount = 0;
        let processedCount = 0;

        const sem = new Semaphore(2); // Reduced to 2 for Render Free Tier stability (512MB RAM)
        const tasks = linksToVisit.map((url, index) => sem.run(async () => {
            if (validCount >= TARGET_VALID_LEADS) return;
            
            const taskNum = index + 1;
            console.log(`[Maps] [Task ${taskNum}/${linksToVisit.length}] Starting extraction for: ${url}`);
            
            try {
                // Add a per-task timeout of 60s to prevent a single hanging site from blocking everything
                const biz = await Promise.race([
                    scrapeListing(context, url, centerLat, centerLng, radiusKm, location, keyword),
                    new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 60000))
                ]).catch(err => {
                    console.error(`[Maps] [Task ${taskNum}] Failed or timed out: ${err.message}`);
                    return null;
                });

                processedCount++;
                if (!biz) {
                    console.log(`[Maps] [Task ${taskNum}] Listing extraction returned no result.`);
                    return;
                }

                console.log(`[Maps] [Task ${taskNum}] Found business: ${biz.name}. Checking for website/email...`);

                if (biz.website) {
                    const emailRes = await scrapeEmail(context, biz.website, biz.name, keyword).catch(err => {
                        console.error(`[Maps] [Task ${taskNum}] Email scraping error: ${err.message}`);
                        return null;
                    });

                    if (emailRes === 'REJECT_EXPIRED' || emailRes === 'REJECT_UNWANTED') {
                        console.log(`[Maps] [Task ${taskNum}] Discarding ${biz.name}: ${emailRes}`);
                        return;
                    }
                    biz.email = emailRes;
                }

                if (biz.email) {
                    results.push(biz);
                    validCount++;
                    console.log(`[Maps] [Task ${taskNum}] SUCCESS! Found email for ${biz.name}. Total found: ${validCount}/${TARGET_VALID_LEADS}`);
                    if (validCount >= TARGET_VALID_LEADS) {
                        console.log(`[Maps] Reached ${TARGET_VALID_LEADS} valid leads. Done.`);
                    }
                } else {
                    console.log(`[Maps] [Task ${taskNum}] No email found for ${biz.name}. Skipping.`);
                }
            } catch (err: any) {
                console.error(`[Maps] [Task ${taskNum}] Fatal error in task: ${err.message}`);
            }
        }));

        await Promise.allSettled(tasks);

        console.log(`[Maps] All tasks finished. Total processed: ${processedCount}. Returning ${results.length} valid leads.`);
        return results;

    } catch (e) {
        console.error('[Maps] Fatal scraper error:', e);
        return [];
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
}

// ─── Semaphore for Concurrency Control ────────────────────────────────────────

class Semaphore {
    private queue: Array<() => void> = [];
    private active = 0;
    constructor(private readonly limit: number) { }

    run<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(() => {
                this.active++;
                fn().then(resolve, reject).finally(() => {
                    this.active--;
                    if (this.queue.length > 0) this.queue.shift()!();
                });
            });
            if (this.active < this.limit) this.queue.shift()!();
        });
    }
}
