
import { searchBusinesses } from './server/services/maps.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log("Starting discovery test for 'IT companies' in 'Chennai'...");
    try {
        const results = await searchBusinesses('IT companies', 'Chennai');
        console.log("Discovery results length:", results.length);
        if (results.length > 0) {
            console.log("First result:", JSON.stringify(results[0], null, 2));
        } else {
            console.log("No results returned. Check if 'py' and scraper are working.");
        }
    } catch (err) {
        console.error("Test failed with error:", err);
    }
}

test();
