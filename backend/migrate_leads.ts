import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting lead status migration...')

  // 1. Any lead with an email should be QUALIFIED status
  const withEmail = await prisma.lead.updateMany({
    where: {
      email: { not: '' },
      status: 'NEW'
    },
    data: {
      status: 'QUALIFIED'
    }
  })
  console.log(`✅ Updated ${withEmail.count} leads with emails to QUALIFIED status.`)

  // 2. Re-evaluate Intent based on Phone AND Email
  // First, set everything with both to HIGH
  const highIntent = await prisma.lead.updateMany({
    where: {
      email: { not: '' },
      phone: { not: '' },
      intent: 'LOW'
    },
    data: {
      intent: 'HIGH'
    }
  })
  console.log(`✅ Updated ${highIntent.count} leads with both Phone/Email to HIGH intent.`)

  // (Optional) If we wanted to set Email-only to LOW, but they probably are already LOW.
  
  console.log('🏁 Migration complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
