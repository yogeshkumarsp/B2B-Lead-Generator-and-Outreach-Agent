import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const itTemplate = {
    "campaign_name": "b2b_it_outreach_sequence",
    "description": "Cold outreach campaign for IT companies to discuss AI-based lead generation and outreach automation",
    "templates": [
        {
            "step": 1,
            "day_delay": 0,
            "template_name": "intro_outreach_automation",
            "subject": "Automating {company}'s prospect discovery",
            "body": "Hi {name},\n\nI came across {company} while researching IT companies in {city}.\n\nI’m the creator of an AI-powered outreach automation tool that helps IT businesses discover new prospects and send personalized messages automatically.\n\nI'm reaching out to see if your team is looking to automate your lead generation process.\n\nWould love to hear how you currently handle this.\n\nBest,\nYogesh Kumar"
        },
        {
            "step": 2,
            "day_delay": 2,
            "template_name": "problem_awareness",
            "subject": "Many IT companies struggle with manual outreach",
            "body": "Hi {name},\n\nMany IT companies spend hours manually finding prospects and sending outreach emails.\n\nWe built a platform that automates lead discovery and AI lead scoring so you can focus on building relationships.\n\nCurious to know — how does {company} currently generate new B2B leads?\n\nBest,\nYogesh Kumar"
        },
        {
            "step": 3,
            "day_delay": 4,
            "template_name": "idea_feedback",
            "subject": "AI agents for {company}'s sales team",
            "body": "Hi {name},\n\nI’m developing a platform that helps businesses automatically find B2B leads and run personalized outreach campaigns using AI agents.\n\nSince you’re at {company}, I thought you'd be interested in seeing how we automate the top of the sales funnel.\n\nDo you think a tool like this could help your team improve their efficiency?\n\nBest regards,\nYogesh Kumar"
        },
        {
            "step": 4,
            "day_delay": 6,
            "template_name": "local_connection",
            "subject": "Connecting with IT companies in {city}",
            "body": "Hi {name},\n\nI’m currently connecting with a few IT companies in {city} to show how our AI platform helps automate prospect discovery and outreach.\n\nI'd love to share how {company} can find more clients automatically.\n\nBest,\nYogesh Kumar"
        },
        {
            "step": 5,
            "day_delay": 8,
            "template_name": "final_followup",
            "subject": "Final follow-up: outreach automation",
            "body": "Hi {name},\n\nJust checking again — how does {company} currently find new B2B clients?\n\nIf you're looking to automate your lead generation with AI, I'd love to hear your thoughts.\n\nBest,\nYogesh"
        }
    ]
};

async function main() {
    console.log("Seeding IT Outreach Sequence...");

    // Check if it already exists to avoid duplicates
    const existing = await prisma.campaign.findFirst({
        where: { name: itTemplate.campaign_name }
    });

    if (existing) {
        console.log("Campaign already exists. Updating steps...");
        await prisma.campaignStep.deleteMany({ where: { campaignId: existing.id } });
        await prisma.campaign.update({
            where: { id: existing.id },
            data: {
                steps: {
                    create: itTemplate.templates.map(s => ({
                        step: s.step,
                        dayDelay: s.day_delay,
                        templateName: s.template_name,
                        subject: s.subject,
                        body: s.body
                    }))
                }
            }
        });
    } else {
        await prisma.campaign.create({
            data: {
                name: itTemplate.campaign_name,
                description: itTemplate.description,
                followUpDelayDays: 2,
                steps: {
                    create: itTemplate.templates.map(s => ({
                        step: s.step,
                        dayDelay: s.day_delay,
                        templateName: s.template_name,
                        subject: s.subject,
                        body: s.body
                    }))
                }
            }
        });
    }

    console.log("Seed successful!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
