
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Updating existing active campaigns with clearer templates...");

    const activeCampaigns = await prisma.campaign.findMany({
        where: { status: 'ACTIVE' },
        include: { steps: true }
    });

    for (const campaign of activeCampaigns) {
        console.log(`Updating campaign: ${campaign.name}`);

        // Extract niche from description if possible, or fallback
        const nicheMatch = campaign.description?.match(/sequence for (.*) in/);
        const niche = nicheMatch ? nicheMatch[1] : "your industry";
        const cityMatch = campaign.description?.match(/in (.*)/);
        const city = cityMatch ? cityMatch[1] : "{City}";

        for (const step of campaign.steps) {
            let newSubject = step.subject;
            let newBody = step.body;

            if (step.step === 1) {
                newSubject = `Question about {Company Name}'s outreach automation`;
                newBody = `Hi,\n\nI came across {Company Name} while researching ${niche} in ${city}. \n\nI’m the creator of an AI-powered lead generation tool, and I'm reaching out to see if your team is looking to automate your B2B outreach and prospect discovery.\n\nWould love to hear how you currently handle this and if our automation could help.\n\nBest regards,\nYogesh Kumar`;
            } else if (step.step === 2) {
                newSubject = `Automating lead discovery for ${niche}`;
                newBody = `Hi,\n\nMany companies in your industry spend hours manually finding and scoring leads. \n\nWe built an AI platform that handles this discovery 24/7 so you can focus on closing deals.\n\nCurious to know — how does {Company Name} currently generate new B2B leads?\n\nBest regards,\nYogesh Kumar`;
            } else if (step.step === 3) {
                newSubject = `Our AI agent for {Company Name}`;
                newBody = `Hi,\n\nI’m developing an AI agent platform specifically for personalized B2B outreach.\n\nSince you’re at {Company Name}, I thought you'd be interested in seeing how we automate the entire top-of-funnel process.\n\nDo you think a tool like this could help your sales team?\n\nBest regards,\nYogesh Kumar`;
            } else if (step.step === 4) {
                newSubject = `Connecting with ${niche} in ${city}`;
                newBody = `Hi,\n\nI’m currently connecting with a few businesses in ${city} to show how our AI tools help automate B2B lead generation.\n\nI'd love to share how {Company Name} can find more clients automatically.\n\nBest regards,\nYogesh Kumar`;
            } else if (step.step === 5) {
                newSubject = `Final follow-up: outreach automation`;
                newBody = `Hi,\n\nJust checking again — how does {Company Name} currently find new B2B clients? \n\nIf you're interested in automating your lead generation with AI, I'd love to chat.\n\nBest regards,\nYogesh Kumar`;
            }

            await prisma.campaignStep.update({
                where: { id: step.id },
                data: { subject: newSubject, body: newBody }
            });
        }
    }

    console.log("Database update successful!");
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
