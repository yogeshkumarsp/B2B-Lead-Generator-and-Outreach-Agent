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

const TARGET_VALID_LEADS = 12; // Slightly more target to ensure 10 clean ones
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

// ─── Main Entry Point (Single-Pass Optimized Integration) ─────────────────────────

export async function searchBusinesses(keyword: string, location: string, radius = '60'): Promise<BusinessResult[]> {
    const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
    if (!APIFY_TOKEN) {
        console.error('[Maps] ❌ APIFY_API_TOKEN is missing in environment variables.');
        return [];
    }

    const client = new ApifyClient({ token: APIFY_TOKEN });
    
    // 1. Build Targeted Search for high relevance
    const searchString = `${keyword}`; 
    console.log(`[Apify] Starting Single-Pass HIGH-SPEED discovery for: "${searchString}" in "${location}"`);

    let finalResults: BusinessResult[] = [];
    
    try {
        // 2. RUN Unified Actor: Google Maps + Contact Scraper (in one server startup)
        const run = await client.actor("compass/crawler-google-places").call({
            searchStringsArray: [searchString],
            locationQuery: location, // RESTRICT to this city
            maxCrawledPlacesPerSearch: 20, 
            scrapeContacts: true, // BUILT-IN email extraction
            scrapePlaceDetailPage: true, // Need this for contacts
            allPlacesNoSearchAction: "all_places_no_search_ocr", // FASTEST mode
            language: "en",
        });

        console.log(`[Apify] Unified run ${run.id} finished. Fetching high-speed results...`);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (!items || items.length === 0) {
            console.log(`[Apify] No listings found.`);
            return finalResults;
        }

        console.log(`[Apify] Found ${items.length} candidate listings. Applying filters and Regex...`);
        
        const seenWebsites = new Set<string>();

        for (const item of items as any[]) {
            if (finalResults.length >= TARGET_VALID_LEADS) break;

            const name = cleanBusinessName(item.title || '');
            const website = item.website || undefined;
            if (!name || !website) continue;
            
            // Deduplicate based on domain
            try {
                const domain = new URL(website).hostname.replace('www.', '').toLowerCase();
                if (seenWebsites.has(domain)) continue;
                seenWebsites.add(domain);
            } catch { continue; }

            // Extract email from contact object or flat fields
            let extractedEmail = null;
            const emails = item.contact?.emails || item.emails || [];
            
            for (const e of emails) {
                const emailStr = typeof e === 'string' ? e : (e.value || e.email || '');
                if (emailStr && EMAIL_REGEX.test(emailStr)) {
                    extractedEmail = emailStr;
                    break;
                }
            }

            // Skip if no email found to meet the target quality
            if (!extractedEmail) continue;

            let phone = item.phone || item.phoneUnformatted || undefined;
            if (phone) phone = phone.replace(/\D/g, '').slice(-10);

            finalResults.push({
                name,
                address: item.address || 'Address not found',
                phone,
                website,
                email: extractedEmail,
                place_id: 'scraped_' + (item.placeId || name.replace(/\s/g, '_')),
                types: item.categories || []
            });
        }
        
        console.log(`[Apify] Single-Pass Pipeline complete! Found ${finalResults.length} leads in record time.`);
        return finalResults;

    } catch (e: any) {
        console.error(`[Apify] Fatal error in Single-Pass Scout:`, e?.message || e);
        return finalResults;
    }
}
