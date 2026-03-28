import { GoogleGenAI } from '@google/genai';
import { isAICooledDown, AICoolDownError, getAICoolDownRemaining } from '../../../frontend/src/services/gemini';

export const analyzeReplySentiment = async (content: string): Promise<{ sentiment: string; summary: string }> => {
    if (isAICooledDown()) {
        return { sentiment: 'NEUTRAL', summary: 'AI is in cool-down (Quota reached)' };
    }

    const keysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.API_KEY;
    const keys = keysStr ? keysStr.split(',').map(k => k.trim()).filter(Boolean) : [];
    
    if (keys.length === 0) {
        console.warn('[AI Service] No API Key found, skipping sentiment analysis');
        return { sentiment: 'NEUTRAL', summary: 'AI Analysis skipped (No API Key)' };
    }

    const prompt = `
You are an AI sales assistant. Analyze the following email reply from a potential B2B lead.
Classify the sentiment and intent into exactly one of these categories:
- INTERESTED: The lead wants to talk, book a meeting, or asks for more info.
- NOT_INTERESTED: The lead says no, stop contacting, or they are happy with their current provider.
- OUT_OF_OFFICE: An automated reply.
- NEUTRAL: A vague reply, "thanks", or "received".

Return ONLY a valid JSON object with two fields:
{
  "sentiment": "CATEGORY_NAME",
  "summary": "A 1-sentence summary of why you chose this category"
}

Email Content:
"${content}"
`;

    for (const apiKey of keys) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: prompt
            });

            const text = response.text?.replace(/```json|```/g, '').trim() || '{"sentiment": "NEUTRAL", "summary": "Failed to parse AI response"}';
            return JSON.parse(text);
        } catch (err: any) {
            if (err.status === 429 || err.status === 403) {
                console.warn(`[AI Service] Key failed with status ${err.status}. Switching to next key...`);
                continue; // Try next key
            }
            console.error('[AI Service] Error analyzing sentiment:', err);
            return { sentiment: 'NEUTRAL', summary: 'Analysis failed due to unexpected error' };
        }
    }

    console.warn('[AI Service] All API keys exhausted or suspended.');
    return { sentiment: 'NEUTRAL', summary: 'All API keys exhausted or suspended' };
};

export const generateConversationalReply = async (
    lead: any,
    replyText: string,
    sentiment: string,
    settings: any
): Promise<{ subject: string; body: string }> => {
    if (isAICooledDown()) {
        throw new AICoolDownError(getAICoolDownRemaining());
    }

    const keysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.API_KEY;
    const keys = keysStr ? keysStr.split(',').map(k => k.trim()).filter(Boolean) : [];
    
    if (keys.length === 0) {
        throw new Error('No API Key found for generating reply');
    }

    const persona = settings?.agentPersona || 'You are a professional B2B SDR.';
    
    const prompt = `
You are acting as an AI Sales Development Representative.
Persona Guidelines: ${persona}

You are currently talking to:
Name: ${lead.name || lead.companyName}
Company: ${lead.companyName}
Industry: ${lead.industry || 'B2B'}

The lead just replied to your previous cold email with this message:
"${replyText}"

The sentiment of their reply was classified as: ${sentiment}

Your task:
Write a conversational, concise, and professional email response addressing their reply.
If they asked a question, answer it confidently based on the context of selling an AI Outreach Automation platform.
If they are interested, suggest a quick 5-10 minute introductory call and ask for their availability.
If they are NOT_INTERESTED, write a polite and very brief closing email thanking them for their time.

Return ONLY a valid JSON object with two fields (do NOT include markdown formatting like \`\`\`json):
{
  "subject": "Re: Your previous subject context (make it natural)",
  "body": "Your email response body here. Keep it under 4 sentences."
}
`;

    for (const apiKey of keys) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: prompt
            });

            const text = response.text?.replace(/```json|```/g, '').trim() || '{}';
            const parsed = JSON.parse(text);
            if (!parsed.subject || !parsed.body) throw new Error("Invalid output format");
            
            return {
                subject: parsed.subject,
                body: parsed.body
            };
        } catch (err: any) {
            if (err.status === 429 || err.status === 403) continue;
            console.error('[AI Service] Error generating reply:', err);
            throw err;
        }
    }

    throw new Error('All API keys exhausted or suspended');
};
