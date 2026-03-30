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
    
    // 1. Generate Multiple Related Keywords to fill the 10-lead quota in small cities
    const baseKeyword = keyword.toLowerCase();
    const searchStrings: string[] = [
        `${keyword} in ${location}`
    ];
    
    // Auto-expand for common niches if it seems thin (optional: just hardcode 3 variations)
    if (baseKeyword.includes('software') || baseKeyword.includes('it') || baseKeyword.includes('tech')) {
        searchStrings.push(`Web development agencies in ${location}`);
        searchStrings.push(`IT solutions in ${location}`);
    } else if (baseKeyword.includes('marketing') || baseKeyword.includes('service')) {
        searchStrings.push(`Digital marketing agency in ${location}`);
        searchStrings.push(`Ad agencies in ${location}`);
    } else {
        // generic fallback expansions
        searchStrings.push(`Professional services in ${location}`);
    }

    console.log(`[Apify] Starting Multi-Keyword Google Maps extraction for: ${searchStrings.join(', ')}`);

    let finalResults: BusinessResult[] = [];
    
    try {
        // 2. Run the Google Maps Extractor actor for ALL keywords
        const mapRun = await client.actor("compass/crawler-google-places").call({
            searchStringsArray: searchStrings,
            maxCrawledPlacesPerSearch: 40, // 40 each * 3 keywords = 120 total candidates
            language: "en",
        });

        console.log(`[Apify] Map run ${mapRun.id} finished. Fetching results...`);
        const { items } = await client.dataset(mapRun.defaultDatasetId).listItems();

        if (!items || items.length === 0) {
            console.log(`[Apify] No listings found.`);
            return finalResults;
        }

        console.log(`[Apify] Found ${items.length} candidate listings. Filtering and deduplicating...`);
        
        let candidateBizs: BusinessResult[] = [];
        const seenWebsites = new Set<string>();

        for (const item of items as any[]) {
            const name = cleanBusinessName(item.title || '');
            const website = item.website || undefined;
            if (!name || !website) continue;
            
            // Deduplicate based on simple domain
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
        
        // Cap at 40 quality candidates for the detailed email crawl
        candidateBizs = candidateBizs.slice(0, 40);

        if (candidateBizs.length === 0) {
             console.log(`[Apify] No unique websites found to scrape. Returning zero leads.`);
             return [];
        }

        console.log(`[Apify] Handing off ${candidateBizs.length} unique websites to vdrmota/contact-info-scraper...`);
        
        // 3. Chained Execution: Contact Info Scraper
        const contactRun = await client.actor("vdrmota/contact-info-scraper").call({
            startUrls: candidateBizs.map(b => ({ url: b.website })),
            maxCrawlDepth: 1, 
            maxCrawlPages: 120, 
            stayWithinDomain: true,
            extractFromText: true,
            proxySettings: { useApifyProxy: true }
        });

        console.log(`[Apify] Contact extraction run ${contactRun.id} finished. Mapping emails back...`);
        const { items: contactItems } = await client.dataset(contactRun.defaultDatasetId).listItems();
        
        const domainToEmails = new Map<string, string>();
        for (const record of contactItems as any[]) {
             const emails = record.emails || [];
             if (emails.length > 0) {
                 try {
                     let domain = record.domain;
                     const possibleUrl = record.url || record.startUrl || (record.scrapedUrls && record.scrapedUrls[0]);
                     
                     if (!domain && possibleUrl) {
                         domain = new URL(possibleUrl).hostname.replace('www.', '').toLowerCase();
                     } else if (domain) {
                         domain = domain.replace('www.', '').toLowerCase();
                     }

                     if (!domain) continue;

                     // Find first email matching our professional REGEX
                     let validEmail = null;
                     for (const e of emails) {
                         const emailStr = typeof e === 'string' ? e : (e.value || e.email || '');
                         if (emailStr && EMAIL_REGEX.test(emailStr)) {
                             validEmail = emailStr;
                             break;
                         }
                     }
                     
                     if (validEmail) {
                         domainToEmails.set(domain, validEmail);
                     }
                 } catch {}
             }
        }
        
        console.log(`[Apify] Mapped ${domainToEmails.size} domains with valid emails using Regex Filter.`);
        
        // 4. Final Construction
        let count = 0;
        for (const biz of candidateBizs) {
            if (count >= TARGET_VALID_LEADS) break;
            
            try {
                const bDomain = new URL(biz.website!).hostname.replace('www.', '').toLowerCase();
                const matchedEmail = domainToEmails.get(bDomain);
                
                if (matchedEmail) {
                    biz.email = matchedEmail;
                    finalResults.push(biz);
                    count++;
                }
            } catch {}
        }

        console.log(`[Apify] Pipeline complete! Found ${finalResults.length}/${TARGET_VALID_LEADS} leads.`);
        return finalResults;

    } catch (e: any) {
        console.error(`[Apify] Fatal failure:`, e?.message || e);
        return finalResults;
    }
}
