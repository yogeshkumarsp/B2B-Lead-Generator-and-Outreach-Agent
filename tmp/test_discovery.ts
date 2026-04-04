import { searchBusinesses } from './backend/server/services/maps_scraper.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log('Testing discovery for "digital marketing agencies" in "krishnagiri"...');
    try {
        const results = await searchBusinesses('digital marketing agencies', 'krishnagiri');
        console.log(`Total results found: ${results.length}`);
        const qualified = results.filter(r => r.email);
        console.log(`Qualified leads (with email): ${qualified.length}`);
        
        qualified.forEach((l, i) => {
            console.log(`${i+1}. ${l.name} - ${l.email}`);
        });

        if (qualified.length >= 10) {
            console.log('✅ SUCCESS: Found 10 or more qualified leads.');
        } else {
            console.log(`⚠️  Found only ${qualified.length} qualified leads. Check if SERPER_API_KEY is working or if the location is too small.`);
        }
    } catch (err) {
        console.error('Error during test:', err);
    }
}

test();
