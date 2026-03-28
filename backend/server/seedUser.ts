import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'yogeshkumar.mca2024@adhiyamaan.in';
    const password = 'yoge-2003';
    const name = 'Yogesh Kumar';

    console.log(`Checking if user ${email} exists...`);
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
        console.log('User already exists. Updating password...');
        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { email },
            data: { passwordHash, name }
        });
        console.log('User password updated successfully.');
    } else {
        console.log('Creating new user...');
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, name, passwordHash }
        });

        // Auto-create default settings
        await prisma.userSettings.create({ data: { userId: user.id } });
        console.log('User created successfully.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
