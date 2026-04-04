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

const TARGET_VALID_LEADS = 50; // Increased to ensure 10+ valid ones even in small cities
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

function cleanEmail(email: string): string {
    if (!email) return '';
    let cleaned = email.toLowerCase().trim();
    
    // Remove trailing dots, commas, or common garbage from snippets
    cleaned = cleaned.replace(/[.,:;!?)\]>]+$/, '');
    
    // Remove common prefixes if they got captured
    const prefixes = ['email:', 'mailto:', 'contact:', 'info:', 'at:'];
    for (const p of prefixes) {
        if (cleaned.startsWith(p)) cleaned = cleaned.slice(p.length);
    }
    
    // Final check for common garbage patterns
    if (cleaned.includes('example.com') || cleaned.includes('noreply') || cleaned.length < 5) return '';
    
    return cleaned.trim();
}

const BUSINESS_BLACKLIST: string[] = []; // All restrictions removed for a "Fresh" experience

// ─── Utilities ────────────────────────────────────────────────────────────────

function cleanBusinessName(name: string): string {
    if (!name) return '';
    const separators = [' | ', ' - ', ' – ', ' : ', ' — ', ' • ', '|', ' , ', ', '];
    let cleaned = name;
    
    // 1. Initial Split-Cleaning
    for (const sep of separators) {
        if (cleaned.includes(sep)) {
            const parts = cleaned.split(sep).map(p => p.trim());
            // If the first part is substantial and the second is a repeat or descriptive, take the first
            if (parts[0].length > 2) {
                if (parts[1] && parts[0].toLowerCase() === parts[1].toLowerCase()) {
                    cleaned = parts[0];
                    break;
                }
                cleaned = parts[0];
                break;
            }
        }
    }

    const descriptive = [
        'digital marketing', 'website designing', 'web design', 'software company', 
        'it services', 'consultancy', 'seo agency', 'social media', 'agency', 
        'company', 'pvt ltd', 'private limited', 'solutions'
    ];
    
    let lower = cleaned.toLowerCase();
    for (const phrase of descriptive) {
        const idx = lower.indexOf(phrase);
        // If phrase is at the end or following a separator, trim it
        if (idx > 3) {
            cleaned = cleaned.slice(0, idx).replace(/[\s\-|:.\/–—•,]+$/, '').trim();
            lower = cleaned.toLowerCase();
        }
    }
    return cleaned.trim();
}

function cleanAddress(address: string): string {
    if (!address) return '';
    // 1. Split by comma and clean
    const parts = address.split(',').map(p => p.trim()).filter(p => p.length > 0);
    
    // 2. Case-Insensitive Deduplication & Redundancy Check
    const uniqueParts: string[] = [];
    const seenLower = new Set<string>();

    for (const part of parts) {
        const lower = part.toLowerCase();
        
        // Skip exact duplicates
        if (seenLower.has(lower)) continue;

        // Skip if this part is fully contained within another part (e.g. "Krishnagiri" vs "Krishnagiri DT")
        // but only if the shorter part is redundant.
        let isRedundant = false;
        for (const existing of uniqueParts) {
            const extLower = existing.toLowerCase();
            if (extLower.includes(lower) || lower.includes(extLower)) {
                // If one is just a shorter version of the other, we stick to the more descriptive one
                if (extLower.length >= lower.length) isRedundant = true;
                // If current is longer/more descriptive, it will replace or we can just keep unique ones
            }
        }
        
        if (isRedundant) continue;

        uniqueParts.push(part);
        seenLower.add(lower);
    }
    
    return uniqueParts.join(', ');
}

/**
 * Stage 2: High-Density Email Discovery using Multi-Layered Search Snippets
 */
async function findEmailViaSearch(bizName: string, location: string, domain?: string): Promise<string | null> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return null;

    try {
        // Combined Mega-Query to save credits while maintaining high hit rate
        const combinedQuery = domain 
            ? `(email OR contact OR "info" OR "reach out" OR "@${domain}" OR "mailto:") site:${domain} OR "${bizName}" ${location} email contact`
            : `"${bizName}" ${location} "email" "contact" "gmail.com" "official"`;
        
        const response = await axios.post('https://google.serper.dev/search', 
            { q: combinedQuery, num: 15 }, // Increased from 8 to 15 for better coverage
            { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' } }
        );

        const results = response.data;
        let allText = '';
        if (results.organic) {
            for (const item of results.organic) {
                allText += ' ' + (item.snippet || '') + ' ' + (item.title || '') + ' ' + (item.link || '');
            }
        }
        if (results.knowledgeGraph) {
            allText += ' ' + JSON.stringify(results.knowledgeGraph);
        }
        
        const matches = allText.match(EMAIL_REGEX);
        if (matches && matches.length > 0) {
            const valid = matches
                .map(m => cleanEmail(m))
                .filter(m => m && m.includes('@'));
            
            if (valid.length > 0) {
                const unique = Array.from(new Set(valid));
                if (domain) {
                    const companyEmail = unique.find(e => e.includes(domain));
                    if (companyEmail) return companyEmail;
                }
                return unique[0];
            }
        }
    } catch (err) {
        return null;
    }
    return null;
}

// ─── Main Entry Point (Keyword Expanded Serper Scout) ─────────────────────────

export async function searchBusinesses(keyword: string, location: string, radius = '60'): Promise<BusinessResult[]> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.error('[Serper] ❌ SERPER_API_KEY is missing in environment variables.');
        return [];
    }

    // ⭐ KEYWORD EXPANSION: Build a bundle of 5 related terms to guarantee volume in small cities
    const baseQuery = keyword.toLowerCase();
    const relatedTerms: string[] = [`${keyword} in ${location}`];
    
    if (baseQuery.includes('software') || baseQuery.includes('it') || baseQuery.includes('tech')) {
        relatedTerms.push(`Web Design agency in ${location}`, `App Development in ${location}`, `Custom Software Development in ${location}`, `SaaS Development in ${location}`, `IT Consulting in ${location}`);
    } else if (baseQuery.includes('marketing') || baseQuery.includes('ad')) {
        relatedTerms.push(`SEO agency in ${location}`, `Social Media Marketing in ${location}`, `Branding agency in ${location}`, `Advertising agency in ${location}`, `Digital Marketing consultant in ${location}`, `PPC agency in ${location}`);
    } else {
        relatedTerms.push(`${keyword} services in ${location}`, `${keyword} company in ${location}`, `Top ${keyword} in ${location}`, `${keyword} agency in ${location}`);
    }

    console.log(`[Serper] ⭐ EXPANDED SEARCH: Fetching from 5 keyword streams in "${location}"...`);

    let finalResults: BusinessResult[] = [];
    
    try {
        // 1. Stage 1: Parallel Keyword Fetching
        const placesPromises = relatedTerms.map(q => 
            axios.post('https://google.serper.dev/places', 
                { q }, 
                { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' } }
            ).catch(() => ({ data: { places: [] }}))
        );

        const placesResponses = await Promise.all(placesPromises);
        const allPlaces = placesResponses.flatMap(r => r.data.places || []);
        
        // Deduplicate initial candidates by Phone or Name
        const uniquePlacesMap = new Map<string, any>();
        for (const p of allPlaces) {
            const key = (p.phoneNumber || p.title || '').replace(/\D/g, '').toLowerCase();
            if (key) uniquePlacesMap.set(key, p);
        }

        const candidates_raw = Array.from(uniquePlacesMap.values()).slice(0, 80); // Evaluating up to 80 candidates for high city volume
        console.log(`[Serper] Found ${candidates_raw.length} unique candidates. Starting Scavenger...`);

        // 2. Stage 2: Parallel Email Scavenging
        const emailPromises = candidates_raw.map(async (place: any) => {
            const name = cleanBusinessName(place.title || '');
            
            // ⭐ STRICT BLACKLIST FILTER
            const isBlacklisted = BUSINESS_BLACKLIST.some(term => 
                name.toLowerCase().includes(term.toLowerCase())
            );
            if (isBlacklisted) {
                console.log(`[Filter] Strictly avoiding blacklisted lead: "${name}"`);
                return null;
            }

            const website = place.website;
            const address = cleanAddress(place.address || 'Address not found');
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
        
        // 3. Sorting: Prioritize complete leads (Email + Phone)
        const sorted = results_raw.filter(c => c !== null).sort((a: any, b: any) => {
            if (a.email && a.phone && (!b.email || !b.phone)) return -1;
            if (b.email && b.phone && (!a.email || !a.phone)) return 1;
            if (a.email && !b.email) return -1;
            if (b.email && !a.email) return 1;
            return 0;
        });

        // Increase target to ensure we have "leftover" leads for the dashboard
        finalResults = sorted.slice(0, TARGET_VALID_LEADS);

        console.log(`[Serper] Pipeline complete! Captured ${finalResults.filter(r => r.email).length} high-quality leads.`);
        return finalResults;

    } catch (e: any) {
        console.error(`[Serper] Fatal error:`, e?.message || e);
        return finalResults;
    }
}
