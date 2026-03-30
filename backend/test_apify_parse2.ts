import { ApifyClient } from 'apify-client';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
    const runInfo = await client.run("FueYqXV1CH0Y3RYba").get();
    const datasetId = runInfo!.defaultDatasetId;
    const { items } = await client.dataset(datasetId).listItems();
    
    for (const item of items as any[]) {
       const emails = item.emails || [];
       if (emails.length > 0) {
           console.log(`Has emails! -> record.url:`, item.url, `| record.domain:`, item.domain, `| record.startUrl:`, item.startUrl);
       }
    }
}
run();
