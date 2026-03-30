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

const TARGET_VALID_LEADS = 12; // Aim for 12 clean ones to ensure 10 are solid
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
 * Stage 2: High-Density Email Discovery using Multi-Layered Search Snippets
 */
async function findEmailViaSearch(bizName: string, location: string, domain?: string): Promise<string | null> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return null;

    try {
        // Multi-Layered Query: Search BOTH the site and the public mentions (Facebook, LinkedIn, Justdial, Indiamart)
        // This is the "Regex Linking" that pulls emails from all over the web.
        const internalQuery = domain ? `(email OR contact OR "info") site:${domain}` : null;
        const externalQuery = `"${bizName}" ${location} "email" OR "contact"`;
        
        const queries = [externalQuery];
        if (internalQuery) queries.push(internalQuery);
        
        // Execute both queries in parallel for maximum density
        const responses = await Promise.all(queries.map(q => 
            axios.post('https://google.serper.dev/search', 
                { q, num: 6 }, // Scan top 6 results
                { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' } }
            )
        ));

        let allText = '';
        for (const resp of responses) {
            const results = resp.data;
            if (results.organic) {
                for (const item of results.organic) {
                    allText += ' ' + (item.snippet || '') + ' ' + (item.title || '') + ' ' + (item.link || '');
                }
            }
        }
        
        // ─── Regex "Linking" ──────────────────────────────────────────────────
        // This rips the emails out of the metadata/snippets Google provides
        const matches = allText.match(EMAIL_REGEX);
        if (matches && matches.length > 0) {
            // Priority Filter: Find first non-junk email
            const blacklisted = ['example.com', 'noreply', 'support@google', 'wixpress', 'sentry.io', '.png', '.jpg', '.gif'];
            const valid = matches.filter(m => {
                const low = m.toLowerCase();
                return !blacklisted.some(b => low.includes(b));
            });
            
            // Deduplicate and return the most professional-looking one
            if (valid.length > 0) {
                const unique = Array.from(new Set(valid.map(e => e.toLowerCase())));
                // Prefer company domain emails over Gmail if both exist
                if (domain) {
                    const companyEmail = unique.find(e => e.includes(domain));
                    if (companyEmail) return companyEmail;
                }
                return unique[0];
            }
        }
    } catch (err) {
        // Quietly fail for individual businesses to keep the loop moving
        return null;
    }
    return null;
}

// ─── Main Entry Point (High-Density Serper Scout) ─────────────────────────────

export async function searchBusinesses(keyword: string, location: string, radius = '60'): Promise<BusinessResult[]> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.error('[Serper] ❌ SERPER_API_KEY is missing in environment variables.');
        return [];
    }

    // Double the sample size to 50 for higher "Email Probability"
    console.log(`[Serper] Starting HIGH-DENSITY discovery (Sample: 50) for: "${keyword}" in "${location}"`);

    let finalResults: BusinessResult[] = [];
    
    try {
        // 1. Stage 1: Get Businesses (Higher Volume)
        const placesResponse = await axios.post('https://google.serper.dev/places', 
            { q: `${keyword} in ${location}` },
            { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' } }
        );

        const places = placesResponse.data.places;
        if (!places || places.length === 0) return [];

        // Increase sample size from 20 to 50 (Serper returns ~20 per request, but we grab all available)
        const candidates_raw = places.slice(0, 50);

        console.log(`[Serper] Analyzing ${candidates_raw.length} candidates with Multi-Layered Regex...`);

        // 2. Stage 2: Parallel Email Scavenging
        const emailPromises = candidates_raw.map(async (place: any) => {
            const name = cleanBusinessName(place.title || '');
            const website = place.website;
            const address = place.address || 'Address not found';
            const phone = place.phoneNumber ? place.phoneNumber.replace(/\D/g, '').slice(-10) : undefined;
            const place_id = place.cid || 'serp_' + (place.title || '').replace(/\s/g, '_');
            const types = place.category ? [place.category] : [];

            if (!name) return null;

            let domain = undefined;
            if (website) {
                try {
                    domain = new URL(website).hostname.replace('www.', '').toLowerCase();
                } catch {}
            }

            // Enhanced "Linking" Regex Scavenger
            const email = await findEmailViaSearch(name, location, domain);

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

        const results_raw = await Promise.all(emailPromises);
        
        // 3. Sorting & Priority Mapping
        // Priority 1: Email + Phone (Qualified - High Intent)
        // Priority 2: Email Only (Qualified - Low Intent)
        // Priority 3: Phone Only (New)
        const sorted = results_raw.filter(c => c !== null).sort((a: any, b: any) => {
            if (a.email && a.phone && (!b.email || !b.phone)) return -1;
            if (b.email && b.phone && (!a.email || !a.phone)) return 1;
            if (a.email && !b.email) return -1;
            if (b.email && !a.email) return 1;
            return 0;
        });

        // Take the top 12 (to ensure 10 clean leads reach the dashboard)
        finalResults = sorted.slice(0, TARGET_VALID_LEADS);

        console.log(`[Serper] Finished! Captured ${finalResults.filter(r => r.email).length} leads with emails.`);
        return finalResults;

    } catch (e: any) {
        console.error(`[Serper] Fatal error:`, e?.message || e);
        return finalResults;
    }
}
