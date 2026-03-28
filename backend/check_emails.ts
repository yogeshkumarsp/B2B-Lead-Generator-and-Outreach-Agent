
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('--- DB USERS ---');
  users.forEach(u => {
    console.log(`- Email: "${u.email}" (Length: ${u.email.length})`);
  });
  console.log('----------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
