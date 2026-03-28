import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.userSettings.findFirst();
    console.log(JSON.stringify(settings, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
