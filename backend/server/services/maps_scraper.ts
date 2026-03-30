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
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

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
    
    // 1. Keyword Bundle for higher variety
    const baseKeyword = keyword.toLowerCase();
    const searchStrings: string[] = [`${keyword} in ${location}`];
    
    if (baseKeyword.includes('software') || baseKeyword.includes('it') || baseKeyword.includes('tech')) {
        searchStrings.push(`Web development in ${location}`);
        searchStrings.push(`IT services in ${location}`);
    } else if (baseKeyword.includes('marketing') || baseKeyword.includes('ad')) {
        searchStrings.push(`Digital marketing in ${location}`);
        searchStrings.push(`SEO agency in ${location}`);
    } else {
        searchStrings.push(`Professional services in ${location}`);
    }

    console.log(`[Apify] Starting FAST discovery for: ${searchStrings.join(', ')}`);

    let finalResults: BusinessResult[] = [];
    
    try {
        // 2. Initial Discovery (Google Maps)
        const mapRun = await client.actor("compass/crawler-google-places").call({
            searchStringsArray: searchStrings,
            maxCrawledPlacesPerSearch: 30, // Leaner search to speed up initial phase
            language: "en",
        });

        console.log(`[Apify] Maps found listings. Filtering candidates...`);
        const { items } = await client.dataset(mapRun.defaultDatasetId).listItems();

        if (!items || items.length === 0) return [];

        let candidateBizs: BusinessResult[] = [];
        const seenWebsites = new Set<string>();

        for (const item of items as any[]) {
            const name = cleanBusinessName(item.title || '');
            const website = item.website || undefined;
            if (!name || !website) continue;
            
            try {
                const domain = new URL(website).hostname.replace('www.', '').toLowerCase();
                if (seenWebsites.has(domain)) continue;
                seenWebsites.add(domain);
            } catch { continue; }

            let phone = item.phone || item.phoneUnformatted || undefined;
            if (phone) phone = phone.replace(/\D/g, '').slice(-10);

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
        
        // Cap at 30 businesses for extraction to keep it lightning fast
        candidateBizs = candidateBizs.slice(0, 30);
        if (candidateBizs.length === 0) return [];

        // 3. TARGETED Scrape: Construct startUrls targeting Homepage + Contact Pages
        const extractionUrls: any[] = [];
        for (const biz of candidateBizs) {
            const base = biz.website!.endsWith('/') ? biz.website!.slice(0, -1) : biz.website!;
            extractionUrls.push({ url: base });
            extractionUrls.push({ url: `${base}/contact` });
            extractionUrls.push({ url: `${base}/contact-us` });
            extractionUrls.push({ url: `${base}/about` });
        }

        console.log(`[Apify] Starting high-precision crawl on ${extractionUrls.length} targeted pages...`);
        
        // Use Contact Info Scraper with maxCrawlDepth: 0 (only scan the pages we provided)
        const contactRun = await client.actor("vdrmota/contact-info-scraper").call({
            startUrls: extractionUrls,
            maxCrawlDepth: 0, // CRITICAL: Stop the crawler from wandering. Scan ONLY these pages.
            maxCrawlPages: 80, // Total pages to scan across all businesses
            stayWithinDomain: true,
            extractFromText: true,
            proxySettings: { useApifyProxy: true }
        });

        console.log(`[Apify] Extraction complete. Parsing leads...`);
        const { items: contactItems } = await client.dataset(contactRun.defaultDatasetId).listItems();
        
        const domainToData = new Map<string, { email: string, phone?: string, address?: string }>();
        for (const record of contactItems as any[]) {
             const emails = record.emails || [];
             if (emails.length > 0) {
                 try {
                     let domain = record.domain || (record.url ? new URL(record.url).hostname.replace('www.', '').toLowerCase() : null);
                     if (!domain) continue;

                     // Find best valid email
                     let bestEmail = null;
                     for (const e of emails) {
                         const emailStr = typeof e === 'string' ? e : (e.value || e.email || '');
                         if (emailStr && EMAIL_REGEX.test(emailStr)) {
                             bestEmail = emailStr;
                             break;
                         }
                     }
                     
                     if (bestEmail) {
                         // Only store if we don't have one for this domain or if this record has more info
                         if (!domainToData.has(domain)) {
                             domainToData.set(domain, { email: bestEmail });
                         }
                     }
                 } catch {}
             }
        }
        
        // 4. Match and Bundle
        let results: BusinessResult[] = [];
        let count = 0;
        for (const biz of candidateBizs) {
            if (count >= TARGET_VALID_LEADS) break;
            
            try {
                const bDomain = new URL(biz.website!).hostname.replace('www.', '').toLowerCase();
                const matched = domainToData.get(bDomain);
                
                if (matched && matched.email) {
                    biz.email = matched.email;
                    results.push(biz);
                    count++;
                }
            } catch {}
        }

        console.log(`[Apify] Finished! Found ${results.length} high-quality leads in record time.`);
        return results;

    } catch (e: any) {
        console.error(`[Apify] Error:`, e?.message || e);
        return finalResults;
    }
}
