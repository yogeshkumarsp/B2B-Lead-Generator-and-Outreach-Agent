
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'myselfyogesh21@gmail.com';
  const password = 'yoge-2003';
  
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log('User not found!');
    return;
  }
  
  const isValid = await bcrypt.compare(password, user.passwordHash);
  console.log(`Password check for "${email}" with password "${password}": ${isValid ? 'PASSED' : 'FAILED'}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
