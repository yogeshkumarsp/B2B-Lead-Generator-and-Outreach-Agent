import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();
async function test() {
    const campaigns = await prisma.campaign.findMany({ include: { leads: true } });
    const leads = await prisma.lead.findMany();
    const settings = await prisma.userSettings.findMany();

    const out = { campaigns, leads, settings };
    fs.writeFileSync('test_output.json', JSON.stringify(out, null, 2));
}
test();
