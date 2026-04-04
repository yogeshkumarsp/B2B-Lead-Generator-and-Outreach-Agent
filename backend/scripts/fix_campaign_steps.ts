import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const digitalMarketingTemplate = {
    "campaign_name": "digital marketing agencies - krishnagiri",
    "description": "Automated 5-step sequence for digital marketing agencies in krishnagiri",
    "templates": [
        {
            "step": 1,
            "day_delay": 0,
            "template_name": "intro_collaboration",
            "subject": "Question about {company}'s digital marketing workflow",
            "body": "Hi there,\n\nI was looking at {company}'s presence in {city} and was impressed by your work.\n\nI’m Yogesh Kumar, and I help digital marketing agencies automate their client acquisition process so they can focus on delivering high-quality results.\n\nI noticed you're in the {industry} space. Do you currently use any AI tools to find and outreach to new B2B prospects?\n\nWould love to hear your thoughts.\n\nBest regards,\n\nYogesh Kumar"
        },
        {
            "step": 2,
            "day_delay": 2,
            "template_name": "scaling_efficiency",
            "subject": "Helping agencies like {company} scale",
            "body": "Hi,\n\nFollowing up on my previous message.\n\nMany digital marketing agencies struggle with the manual time it takes to find qualified leads. We've built an AI agent that handles all the heavy lifting—from discovery to personalized outreach.\n\nHow is {company} currently handling its outbound sales? I’d be happy to show you how we can automate it.\n\nBest regards,\n\nYogesh Kumar"
        },
        {
            "step": 3,
            "day_delay": 4,
            "template_name": "process_transparency",
            "subject": "Automating the top of your funnel",
            "body": "Hi,\n\nI wanted to share a bit more about how our AI outreach works for agencies like yours.\n\nInstead of manual searching, our tool identifies prospects based on your target niche and sends personalized messages that actually get replies.\n\nSince you're at {company}, I thought this might be a great asset for your growth strategy.\n\nAre you open to a quick 5-minute chat about this?\n\nBest regards,\n\nYogesh Kumar"
        },
        {
            "step": 4,
            "day_delay": 6,
            "template_name": "local_trust",
            "subject": "Connecting with local businesses in {city}",
            "body": "Hi,\n\nI'm specifically looking to work with companies in the {city} area, and {company} stood out to me.\n\nWe’ve found that agencies using AI-driven outreach can double their meeting volume without adding more staff.\n\nI’d love to help {company} achieve similar results.\n\nBest regards,\n\nYogesh Kumar"
        },
        {
            "step": 5,
            "day_delay": 8,
            "template_name": "final_check",
            "subject": "Last follow-up from Yogesh",
            "body": "Hi,\n\nI don't want to be a pest, so this will be my final message.\n\nIf you're ever looking to automate your agency's lead generation or want to see how AI can help {company} grow, feel free to reach out.\n\nWishing you much success!\n\nBest regards,\n\nYogesh Kumar"
        }
    ]
};

async function main() {
    console.log("Adding 5-step sequence to 'krishnagiri' campaign...");

    const campaign = await prisma.campaign.findFirst({
        where: { name: digitalMarketingTemplate.campaign_name }
    });

    if (!campaign) {
        console.error(`❌ Campaign '${digitalMarketingTemplate.campaign_name}' not found.`);
        return;
    }

    console.log(`Found campaign ID: ${campaign.id}. Adding ${digitalMarketingTemplate.templates.length} steps...`);

    // Clear existing steps if any (though there shouldn't be any)
    await prisma.campaignStep.deleteMany({ where: { campaignId: campaign.id } });

    // Create new steps
    await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
            steps: {
                create: digitalMarketingTemplate.templates.map(s => ({
                    step: s.step,
                    dayDelay: s.day_delay,
                    templateName: s.template_name,
                    subject: s.subject,
                    body: s.body
                }))
            }
        }
    });

    console.log("✅ Steps added successfully!");

    // Also ensure all leads in this campaign are set to Step 1 if they haven't started
    const updateRes = await prisma.lead.updateMany({
        where: { campaignId: campaign.id, outreachStatus: 'PENDING' },
        data: { currentStep: 1 }
    });

    console.log(`✅ Updated ${updateRes.count} pending leads to Step 1.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
