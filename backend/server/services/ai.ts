import axios from 'axios';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = "llama-3.3-70b-versatile";

export const analyzeReplySentiment = async (content: string): Promise<{ sentiment: string; summary: string }> => {
    if (!GROQ_API_KEY) {
        console.warn('[AI Service] No GROQ_API_KEY found, skipping sentiment analysis');
        return { sentiment: 'NEUTRAL', summary: 'AI Analysis skipped (No API Key)' };
    }

    const prompt = `
Analyze the following email reply from a potential B2B lead.
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

    try {
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: GROQ_MODEL,
            messages: [
                { 
                    role: "system", 
                    content: "You are a lead sentiment analyzer. You must respond ONLY with a valid JSON object." 
                },
                { 
                    role: "user", 
                    content: `${prompt}\n\nIMPORTANT: Your response must be a valid JSON object.` 
                }
            ],
            response_format: { type: "json_object" }
        }, {
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            timeout: 15000
        });

        const data = response.data;
        const text = data.choices[0]?.message?.content || '{"sentiment": "NEUTRAL", "summary": "Failed to parse AI response"}';
        return JSON.parse(text);
    } catch (err: any) {
        console.error('[AI Service] Error analyzing sentiment with Groq:', err.response?.data || err.message);
        return { sentiment: 'NEUTRAL', summary: 'Analysis failed due to unexpected error' };
    }
};

export const generateConversationalReply = async (
    lead: any,
    replyText: string,
    sentiment: string,
    settings: any
): Promise<{ subject: string; body: string }> => {
    if (!GROQ_API_KEY) {
        console.error('[AI Service] No GROQ_API_KEY found for generating reply');
        return { subject: 'Re: Follow up', body: `Hi ${lead.name || 'there'}, thanks for the reply. Let me know when you're free to chat.` };
    }

    const persona = settings?.agentPersona || 'You are a professional B2B SDR.';
    
    const prompt = `
You are acting as an AI Sales Development Representative.
Persona Guidelines: ${persona}

Talking to: ${lead.name || lead.companyName} at ${lead.companyName} (${lead.industry || 'B2B'})

The lead just replied: "${replyText}" (Sentiment: ${sentiment})

Task: Write a conversational, concise email response (under 4 sentences).
- If INTERESTED: Suggest a 5-10 min call and ask for availability.
- If NOT_INTERESTED: Polite and brief closing.
- SPACING: Use double newlines (\\n\\n) between the greeting, body, and sign-off.

Return ONLY a valid JSON object:
{
  "subject": "Re: Your previous subject context (make it natural)",
  "body": "Your email response body here."
}
`;

    try {
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: GROQ_MODEL,
            messages: [
                { 
                    role: "system", 
                    content: "You are a professional B2B email personalization expert. You must respond ONLY with a valid JSON object matching the requested schema." 
                },
                { 
                    role: "user", 
                    content: `${prompt}\n\nIMPORTANT: Your response must be a valid JSON object. Do not include any text outside the JSON structure.` 
                }
            ],
            response_format: { type: "json_object" }
        }, {
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            timeout: 15000
        });

        const data = response.data;
        const text = data.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(text);
        if (!parsed.subject || !parsed.body) throw new Error("Invalid output format");
        
        return {
            subject: parsed.subject,
            body: parsed.body
        };
    } catch (err: any) {
        console.error('[AI Service] Error generating reply with Groq:', err.response?.data || err.message);
        return { subject: 'Follow up', body: 'The AI was unable to generate a personalized response. Please follow up manually.' };
    }
};

export const generatePersonalizedEmail = async (
    lead: any,
    template: string,
    subjectTemplate: string,
    settings: any
): Promise<{ subject: string; body: string }> => {
    const fallback = (t: string) => {
        return t
            .replace(/{company}|{{company}}/gi, lead.companyName || lead.name || 'your company')
            .replace(/{name}|{{name}}/gi, lead.name || lead.companyName || 'valued partner')
            .replace(/{industry}|{{industry}}/gi, lead.industry || lead.searchNiche || 'your industry')
            .replace(/{city}|{{city}}/gi, lead.address || lead.searchLocation || 'your city');
    };

    if (!GROQ_API_KEY) {
        console.warn('[AI Service] No GROQ_API_KEY found, using template fallback');
        return {
            subject: fallback(subjectTemplate),
            body: fallback(template)
        };
    }

    const aiTargetKeyword = lead.searchNiche || lead.industry || 'B2B';
    const prompt = `
Persona: ${settings?.agentPersona || 'You are a professional B2B SDR.'}
Subject Template: ${subjectTemplate}
Body Template: ${template}

Lead Details:
- Name: ${lead.name || lead.companyName}
- Company: ${lead.companyName}
- Industry: ${aiTargetKeyword}
- Location: ${lead.address || lead.searchLocation}

Task: Write a highly personalized B2B outreach email based on the templates. 
CRITICAL: Use the templates as a structural framework, but write an intelligent, industry-specific email. Avoid all brackets like {company}.
SPACING: You MUST use double newlines (\\n\\n) between the greeting, every paragraph, and the sign-off. The message must NOT be one solid block.

Return strictly as a JSON object:
{"subject": "personalized subject", "body": "personalized email body"}
`;

    try {
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: GROQ_MODEL,
            messages: [
                { role: "system", content: "You are a professional B2B email personalization expert. You MUST respond ONLY with a valid JSON object." },
                { role: "user", content: `${prompt}\n\nIMPORTANT: Your response must be a valid JSON object.` }
            ],
            response_format: { type: "json_object" }
        }, {
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            timeout: 15000
        });

        const data = response.data;
        const text = data.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(text);
        
        return {
            subject: parsed.subject || fallback(subjectTemplate),
            body: parsed.body || fallback(template)
        };
    } catch (err: any) {
        console.error('[AI Service] Personalization failed with Groq:', err.response?.data || err.message);
        return {
            subject: fallback(subjectTemplate),
            body: fallback(template)
        };
    }
};

export const generateNicheSequence = async (niche: string, location: string): Promise<any[]> => {
    if (!GROQ_API_KEY) {
        console.warn('[AI Service] No GROQ_API_KEY for sequence generation, using static fallback');
        return [
            { step: 1, day_delay: 0, template_name: 'Intro', subject: 'Automating {company}\'s prospect discovery', body: 'Hi {name},\n\nI came across {company} while researching IT companies in {city}.\n\nI’m the creator of an AI-powered outreach automation tool that helps IT businesses discover new prospects and send personalized messages automatically.\n\nI\'m reaching out to see if your team is looking to automate your lead generation process.\n\nWould love to hear how you currently handle this.\n\nBest,\nYogesh Kumar' },
            { step: 2, day_delay: 2, template_name: 'Problem', subject: 'Many IT companies struggle with manual outreach', body: 'Hi {name},\n\nMany IT companies spend hours manually finding prospects and sending outreach emails.\n\nWe built a platform that automates lead discovery and AI lead scoring so you can focus on building relationships.\n\nCurious to know — how does {company} currently generate new B2B leads?\n\nBest,\nYogesh Kumar' },
            { step: 3, day_delay: 5, template_name: 'Follow up', subject: 'AI agents for {company}\'s sales team', body: 'Hi {name},\n\nI’m developing a platform that helps businesses automatically find B2B leads and run personalized outreach campaigns using AI agents.\n\nSince you’re at {company}, I thought you\'d be interested in seeing how we automate the top of the sales funnel.\n\nDo you think a tool like this could help your team improve their efficiency?\n\nBest regards,\nYogesh Kumar' }
        ];
    }

    const prompt = `
Create a professional 5-step B2B outreach sequence for the niche: "${niche}" in "${location}".
Focus: Selling an AI-powered outreach automation platform.
SPACING: You MUST use double newlines (\\n\\n) between the greeting, body paragraphs, and the sign-off in every "body" field.

Return as a JSON array of objects with: "step", "day_delay", "template_name", "subject", "body".
`;

    try {
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: GROQ_MODEL,
            messages: [
                { 
                    role: "system", 
                    content: "You are an outreach expert. You must respond ONLY with a valid JSON array or object." 
                },
                { 
                    role: "user", 
                    content: `${prompt}\n\nIMPORTANT: Your response must be valid JSON.` 
                }
            ],
            response_format: { type: "json_object" }
        }, {
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            timeout: 15000
        });

        const data = response.data;
        const text = data.choices[0]?.message?.content || "[]";
        let parsed = JSON.parse(text);
        if (parsed.steps) parsed = parsed.steps; // Handle nested objects
        return Array.isArray(parsed) ? parsed : [];
    } catch (err: any) {
        console.error('[AI Service] Sequence generation failed:', err.response?.data || err.message);
        return [];
    }
};
