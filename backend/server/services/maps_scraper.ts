import axios from 'axios';

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
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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

/**
 * Stage 2: Smart Email Discovery using Google Search Snippets (Fast & Free)
 */
async function findEmailViaSearch(bizName: string, domain?: string): Promise<string | null> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return null;

    try {
        // Targeted query: "email" for the business, searching for patterns in snippets
        const query = domain ? `email site:${domain}` : `email "${bizName}" official contact`;
        
        const response = await axios.post('https://google.serper.dev/search', 
            { q: query, num: 5 },
            { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' } }
        );

        const results = response.data;
        let allText = '';
        
        // Combine snippets and descriptions to scan for emails
        if (results.organic) {
            for (const item of results.organic) {
                allText += ' ' + (item.snippet || '') + ' ' + (item.title || '');
            }
        }
        
        const matches = allText.match(EMAIL_REGEX);
        if (matches && matches.length > 0) {
            // Filter out common junk
            const valid = matches.filter(m => !m.endsWith('.png') && !m.endsWith('.jpg') && !m.includes('example.com'));
            return valid[0] || null;
        }
    } catch (err) {
        console.error(`[Serper] Error fetching email for ${bizName}:`, err);
    }
    return null;
}

// ─── Main Entry Point (Serper.dev High-Speed Integration) ─────────────────────

export async function searchBusinesses(keyword: string, location: string, radius = '60'): Promise<BusinessResult[]> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.error('[Serper] ❌ SERPER_API_KEY is missing in environment variables.');
        return [];
    }

    console.log(`[Serper] Starting ULTRA-FAST discovery for: "${keyword}" in "${location}"`);

    let finalResults: BusinessResult[] = [];
    
    try {
        // 1. Stage 1: Get Businesses via Google Places (Serper)
        const placesResponse = await axios.post('https://google.serper.dev/places', 
            { q: `${keyword} in ${location}` },
            { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' } }
        );

        const places = placesResponse.data.places;
        if (!places || places.length === 0) {
            console.log(`[Serper] No places found for "${keyword}" in "${location}".`);
            return [];
        }

        console.log(`[Serper] Found ${places.length} businesses. Starting snippet-based email discovery...`);

        // 2. Stage 2: Parallel Email Discovery (Instant results)
        const emailPromises = places.map(async (place: any) => {
            const name = cleanBusinessName(place.title || '');
            const website = place.website;
            const address = place.address || 'Address not found';
            const phone = place.phoneNumber ? place.phoneNumber.replace(/\D/g, '').slice(-10) : undefined;
            const place_id = place.cid || 'serp_' + name.replace(/\s/g, '_');
            const types = place.category ? [place.category] : [];

            if (!name) return null;

            let domain = undefined;
            if (website) {
                try {
                    domain = new URL(website).hostname.replace('www.', '').toLowerCase();
                } catch {}
            }

            // Find email without crawling (using search snippets)
            const email = await findEmailViaSearch(name, domain);

            return {
                name,
                address,
                phone,
                website,
                email,
                place_id,
                types
            } as BusinessResult;
        });

        const candidates = await Promise.all(emailPromises);
        
        // 3. Filter for quality (Ideally must have an email for outreach)
        for (const cand of candidates) {
            if (cand && cand.email) {
                finalResults.push(cand);
                if (finalResults.length >= TARGET_VALID_LEADS) break;
            }
        }

        // 4. Fallback: If we didn't hit 10, include some without emails so the user sees results
        if (finalResults.length < TARGET_VALID_LEADS) {
            for (const cand of candidates) {
                if (cand && !cand.email && !finalResults.some(r => r.name === cand.name)) {
                    finalResults.push(cand);
                    if (finalResults.length >= TARGET_VALID_LEADS) break;
                }
            }
        }

        console.log(`[Serper] Finished! Found ${finalResults.length} leads in ~15 seconds total.`);
        return finalResults;

    } catch (e: any) {
        console.error(`[Serper] Fatal error:`, e?.message || e);
        return finalResults;
    }
}
