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

// ─── Utilities ────────────────────────────────────────────────────────────────

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

// ─── Main Entry Point (Apify Chained Integration) ─────────────────────────────

export async function searchBusinesses(keyword: string, location: string, radius = '60'): Promise<BusinessResult[]> {
    const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
    if (!APIFY_TOKEN) {
        console.error('[Maps] ❌ APIFY_API_TOKEN is missing in environment variables.');
        return [];
    }

    const client = new ApifyClient({ token: APIFY_TOKEN });
    const searchString = `${keyword} in ${location}`;
    console.log(`[Apify] Starting Google Maps extraction for: "${searchString}"`);

    let results: BusinessResult[] = [];
    
    try {
        // 1. Run the Google Maps Extractor actor
        const mapRun = await client.actor("compass/crawler-google-places").call({
            searchStringsArray: [searchString],
            maxCrawledPlacesPerSearch: 80, // Fetch plenty since many lack emails
            language: "en",
        });

        console.log(`[Apify] Run ${mapRun.id} finished. Fetching map results...`);
        const { items } = await client.dataset(mapRun.defaultDatasetId).listItems();

        if (!items || items.length === 0) {
            console.log(`[Apify] No listings found for "${searchString}".`);
            return results;
        }

        console.log(`[Apify] Found ${items.length} candidate businesses. Filtering for websites...`);
        
        let candidateBizs: BusinessResult[] = [];
        for (const item of items as any[]) {
            const name = cleanBusinessName(item.title || '');
            if (!name) continue;
            let phone = item.phone || item.phoneUnformatted || undefined;
            if (phone) phone = phone.replace(/\D/g, '').slice(-10);
            
            const website = item.website || undefined;
            if (!website) continue; // Must have website to scrape email!

            candidateBizs.push({
                name,
                address: item.address || 'Address not found',
                phone,
                website,
                email: null,
                place_id: 'scraped_' + name.replace(/\s/g, '_'),
                types: item.categories || []
            });
        }
        
        // Take an upper bound of 40 quality candidates to send to contact scraper
        candidateBizs = candidateBizs.slice(0, 40);

        if (candidateBizs.length === 0) {
             console.log(`[Apify] None of the returned map results had a website. Returning 0 fully qualified leads.`);
             return [];
        }

        console.log(`[Apify] Handing off ${candidateBizs.length} websites to vdrmota/contact-info-scraper...`);
        
        const startUrls = candidateBizs.map(b => ({ url: b.website }));
        
        // 2. Chained Execution: Contact Info Scraper
        const contactRun = await client.actor("vdrmota/contact-info-scraper").call({
            startUrls,
            maxCrawlDepth: 1, // Look at the start page and immediate subpages
            maxCrawlPages: 120, // max global pages (40 urls * 3 pages)
            stayWithinDomain: true,
            extractFromText: true,
            proxySettings: { useApifyProxy: true }
        });

        console.log(`[Apify] Contact extraction run ${contactRun.id} finished. Parsing extracted emails...`);
        const contactData = await client.dataset(contactRun.defaultDatasetId).listItems();
        
        // 3. Map extracted emails back to their parent domains
        const domainToEmails = new Map<string, string>();
        for (const record of contactData.items as any[]) {
             const emails = record.emails || [];
             if (emails.length > 0 && record.url) {
                 try {
                     const urlObj = new URL(record.url);
                     const domain = urlObj.hostname.replace('www.', '').toLowerCase();
                     
                     // Find the first valid email (handle both plain strings and { value: "x@x.com" } objects)
                     let extractedEmail = null;
                     for (const e of emails) {
                         const emailStr = typeof e === 'string' ? e : (e.value || e.email || '');
                         if (emailStr && typeof emailStr === 'string' && emailStr.includes('@') && !emailStr.includes('.png') && !emailStr.includes('.jpg')) {
                             extractedEmail = emailStr;
                             break;
                         }
                     }
                     
                     if (extractedEmail) {
                         domainToEmails.set(domain, extractedEmail);
                     }
                 } catch (err) {
                     console.error(`[Apify] Error parsing email for ${record.url}:`, err);
                 }
             }
        }
        
        console.log(`[Apify] Mapped ${domainToEmails.size} unique domains with valid emails.`);
        
        // 4. Build final results array capped at TARGET_VALID_LEADS
        let validCount = 0;
        for (const biz of candidateBizs) {
            if (validCount >= TARGET_VALID_LEADS) break;
            
            try {
                const bDomain = new URL(biz.website!).hostname.replace('www.', '').toLowerCase();
                const matchedEmail = domainToEmails.get(bDomain);
                
                if (matchedEmail) {
                    biz.email = matchedEmail;
                    results.push(biz);
                    validCount++;
                    console.log(`[Apify] Chained SUCCESS! Found email for ${biz.name}: ${biz.email}`);
                } else {
                    console.log(`[Apify] Contact Actor no email found for ${biz.name}. Skipping.`);
                }
            } catch { } // ignore URL parsing errors for bad websites
        }

        console.log(`[Apify] Chain extraction complete. Returning ${results.length}/${TARGET_VALID_LEADS} fully qualified leads to dashboard.`);
        return results;

    } catch (e: any) {
        console.error(`[Apify] Fatal error calling Apify API:`, e?.message || e);
        return results;
    }
}
