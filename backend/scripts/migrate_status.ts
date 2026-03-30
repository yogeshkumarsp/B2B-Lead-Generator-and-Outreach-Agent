
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.lead.updateMany({
    where: { status: 'NEW' },
    data: { status: 'UNQUALIFIED' }
  });
  console.log(`Successfully updated ${result.count} leads from NEW to UNQUALIFIED.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
