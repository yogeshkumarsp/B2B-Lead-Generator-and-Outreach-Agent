import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import { ApifyClient } from 'apify-client';

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
const MAX_LINKS = 40;
const FETCH_TIMEOUT_MS = 8000;
const PAGE_TIMEOUT_MS = 15000;

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

            // SPA fallback has been removed to save server resources.
            // Heavily relies on regex over fast fetch or Google AI.

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

// ─── Main Entry Point (Apify Integration) ─────────────────────────────────────

export async function searchBusinesses(keyword: string, location: string, radius = '60'): Promise<BusinessResult[]> {
    const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
    if (!APIFY_TOKEN) {
        console.error('[Maps] ❌ APIFY_API_TOKEN is missing in environment variables.');
        return [];
    }

    const client = new ApifyClient({ token: APIFY_TOKEN });
    const searchString = `${keyword} within 50km of ${location}`;
    console.log(`[Apify] Starting Google Maps extraction for: "${searchString}"`);

    let results: BusinessResult[] = [];
    
    try {
        // Run the Google Maps Extractor actor
        const run = await client.actor("compass/crawler-google-places").call({
            searchStringsArray: [searchString],
            maxCrawledPlacesPerSearch: 80, // Request roughly 80 to ensure our fast HTML-only scraper can easily find 10 valid emails
            language: "en",
            zoom: 11 // zoom out to 11 to roughly cover a 50km radius in viewport
        });

        console.log(`[Apify] Run ${run.id} finished. Fetching results...`);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (!items || items.length === 0) {
            console.log(`[Apify] No listings found for "${searchString}".`);
            return results;
        }

        console.log(`[Apify] Found ${items.length} candidate businesses. Starting local email extraction...`);

        let validCount = 0;
        let processedCount = 0;

        for (const item of items as any[]) {
            if (validCount >= TARGET_VALID_LEADS) break;
            
            processedCount++;
            const name = cleanBusinessName(item.title || '');
            if (!name) continue;

            const address = item.address || 'Address not found';
            let phone = item.phone || item.phoneUnformatted || undefined;
            if (phone) phone = phone.replace(/\D/g, '').slice(-10);
            
            const website = item.website || undefined;
            const types = item.categories || [];
            
            const biz: BusinessResult = {
                name,
                address,
                phone,
                website,
                email: null,
                place_id: 'scraped_' + name.replace(/\s/g, '_'),
                types
            };

            console.log(`[Apify] [Task ${processedCount}] Checking emails for: ${biz.name} (${biz.website || 'No website'})`);

            if (biz.website) {
                const emailRes = await Promise.race([
                    scrapeEmail(biz.website, biz.name, keyword),
                    new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Email timeout')), 15000))
                ]).catch(err => {
                    console.log(`[Apify] Email scraping error: ${err.message}`);
                    return null;
                });

                if (emailRes === 'REJECT_EXPIRED' || emailRes === 'REJECT_UNWANTED') {
                    console.log(`[Apify] Discarding ${biz.name}: ${emailRes}`);
                    continue;
                }
                biz.email = emailRes;
            }

            if (biz.email) {
                results.push(biz);
                validCount++;
                console.log(`[Apify] SUCCESS! Found email for ${biz.name}. Total found: ${validCount}/${TARGET_VALID_LEADS}`);
            } else {
                console.log(`[Apify] No email found for ${biz.name}. Skipping.`);
            }
        }

        console.log(`[Apify] Extraction complete. Returning ${results.length} valid leads.`);
        
        return results;

    } catch (e: any) {
        console.error(`[Apify] Fatal error calling Apify API:`, e.response?.data || e.message);
        return results;
    }
}
