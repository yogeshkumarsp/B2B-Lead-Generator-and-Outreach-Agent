import { Lead } from '../src/types';
import { generatePersonalizedEmail } from '../src/services/gemini';
import { DEFAULT_SETTINGS } from '../src/constants';

async function main() {
    process.env.API_KEY = process.env.GEMINI_API_KEY || 'AIza...'; // Replace with a real key if needed, or rely on system env

    const lead: Lead = {
        id: '1',
        name: 'DigiMartrix',
        company: 'DigiMartrix',
        title: 'CEO',
        industry: 'it companies',
        searchLocation: 'krishnagiri',
        location: 'krishnagiri',
        searchNiche: 'it companies',
        score: 80,
        status: 'QUALIFIED' as any,
        outreachStatus: 'PENDING' as any,
        followUpCount: 0,
        currentStep: 1,
        createdAt: Date.now(),
        source: 'manual',
        userId: 'admin'
    };

    const templateBody = "Hi,\n\nI came across {Company Name} while researching it companies in {City}, and I had a quick question.\n\nHow is your team currently handling lead generation and outreach?\n\nI’m working on an AI-based tool for this and would love your perspective.\n\nBest regards,\nYogesh Kumar";

    console.log("Testing generation...");
    try {
        const result = await generatePersonalizedEmail(lead, templateBody, "Quick question", DEFAULT_SETTINGS);
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
