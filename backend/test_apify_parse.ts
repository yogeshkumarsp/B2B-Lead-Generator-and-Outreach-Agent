import { ApifyClient } from 'apify-client';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
    try {
        console.log("Fetching dataset for run FueYqXV1CH0Y3RYba...");
        const runInfo = await client.run("FueYqXV1CH0Y3RYba").get();
        
        const datasetId = runInfo.defaultDatasetId;
        const { items } = await client.dataset(datasetId).listItems();
        
        console.log(`Found ${items.length} items in dataset.`);
        let found = 0;
        for (const item of items) {
           const emails = (item as any).emails || [];
           if (emails.length > 0) {
               console.log(`Domain: ${(item as any).domain} -> Emails:`, emails);
               found++;
           }
        }
        console.log(`Found ${found} domains with emails.`);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
