import './env';
import { GoogleGenAI } from '@google/genai';

async function testFilter() {
    const businesses = [
        { name: "Contentfeeds" },
        { name: "Kyne Web Clicks" },
        { name: "Youths Media" },
        { name: "Grofast" },
        { name: "VineAtZ OPC Private Limited" },
        { name: "SKY X Digi Solutions" },
        { name: "admax advertising" },
        { name: "Glorex Infotech" }
    ];
    const niche = "Software Companies";

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
You are a strict B2B lead evaluator.
I am searching for B2B leads strictly in this niche/industry: "${niche}".
Below is a JSON list of businesses scraped from Google Maps. Google Maps often returns irrelevant results (e.g., consumer retail stores, restaurants, residential services, or subsidiaries in the wrong sector).
For example, if the niche is "IT companies" or "Software", an electronics retail store (like "Reliance Digital") or a battery manufacturer MUST be REJECTED.

Analyze the business names and their implied industries.
Return ONLY a valid JSON array of the indices (0-based numbers) of the businesses that TRULY match the "${niche}" B2B niche.
If none match, return []. Do not include any other text, markdown, or explanations.

Businesses:
${JSON.stringify(businesses.map((b, i) => ({ index: i, name: b.name })), null, 2)}
`;
    console.log(prompt);
    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt
    });

    const text = response.text?.replace(/```json|```/g, '').trim() || "[]";
    const validIndices: number[] = JSON.parse(text);
    console.log("Valid indices:", validIndices);
    console.log("Accepted businesses:", businesses.filter((_, i) => validIndices.includes(i)));
}
testFilter().catch(console.error);
