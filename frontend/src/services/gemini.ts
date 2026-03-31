
import { GoogleGenAI, Type } from "@google/genai";
import { Lead, Campaign, AppSettings } from "../types";
import { apiFetch } from "./apiFetch";

let currentKeyIndex = 0;
let globalCoolDownUntil: number = 0;
let lastCallTimestamp: number = 0;
const MIN_DELAY_BETWEEN_CALLS = 2000; // 2 seconds between any AI calls

export class AICoolDownError extends Error {
  constructor(public retryAfterMs: number) {
    super(`AI is in cool-down until ${new Date(Date.now() + retryAfterMs).toLocaleTimeString()}`);
    this.name = 'AICoolDownError';
  }
}

export const isAICooledDown = () => {
    return Date.now() < globalCoolDownUntil;
};

export const getAICoolDownRemaining = () => {
    return Math.max(0, globalCoolDownUntil - Date.now());
};

const getKeys = () => {
  const pluralKeys = process.env.GEMINI_API_KEYS || "";
  const singularKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  const keys = pluralKeys.split(",").map(k => k.trim()).filter(Boolean);
  if (singularKey && !keys.includes(singularKey)) {
    keys.unshift(singularKey);
  }
  return keys;
};

const getAI = (apiKey: string) => {
  return new GoogleGenAI({ apiKey });
};

export const executeWithRetry = async <T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> => {
  // Ensure minimum delay between calls to smooth out quota usage
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTimestamp;
  if (timeSinceLastCall < MIN_DELAY_BETWEEN_CALLS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_BETWEEN_CALLS - timeSinceLastCall));
  }

  if (isAICooledDown()) {
    throw new AICoolDownError(getAICoolDownRemaining());
  }

  const keys = getKeys();
  if (keys.length === 0) throw new Error('No Gemini API keys found in environment (check GEMINI_API_KEYS)');

  let lastError = null;
  const startStartIndex = currentKeyIndex;

  for (let i = 0; i < keys.length; i++) {
    const idx = (startStartIndex + i) % keys.length;
    const key = keys[idx];
    
    try {
      const client = getAI(key);
      const result = await fn(client);
      currentKeyIndex = idx; // Stay on this key for next time
      return result;
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.getHTTPStatus?.() || 0;
      const msg = error?.message?.toLowerCase() || "";
      
      // If it's a quota error (429), try the next key
      if (status === 429 || status === 403 || msg.includes('quota') || msg.includes('limit')) {
        console.warn(`[AI] Key ${idx + 1}/${keys.length} rate limited. Rotating...`);
        
        // If it's specifically a DAILY limit, we should eventually enter cooldown after all keys fail
        if (msg.includes('per day') || msg.includes('limit: 0')) {
             console.error(`[AI] Key ${idx + 1} DAILY QUOTA EXHAUSTED.`);
        }
        continue; // Go to next key!
      }
      throw error; // Rethrow if it's a real logic error
    }
  }
  
  // If we get here, ALL keys failed. NOW we enter global cool-down.
  console.error(`[AI] ALL ${keys.length} KEYS EXHAUSTED / RATE LIMITED. Entering global 2-minute cool-down.`);
  globalCoolDownUntil = Date.now() + (2 * 60 * 1000); 
  throw new AICoolDownError(getAICoolDownRemaining());
};

export const generatePersonalizedEmail = async (
  lead: Lead,
  template: string,
  subject: string,
  settings: AppSettings
): Promise<{ subject: string; body: string }> => {
  try {
    const aiTargetKeyword = lead.searchNiche || lead.industry || 'B2B';
    const prompt = `
      Persona: ${settings.agentPersona}
      Subject Template: ${subject}
      Body Template: ${template}
      Lead Details:
      - Name: ${lead.name}
      - Company: ${lead.company}
      - Title: ${lead.title}
      - Target Industry / Niche: ${aiTargetKeyword}
      - City: ${lead.searchLocation || lead.location}
      
      Instructions: Write a short, highly personalized B2B outreach email. 
      CRITICAL: You are reaching out to a "${aiTargetKeyword}" business named "${lead.company}".
      You must dynamically tailor the pain points and value proposition specifically to the ${aiTargetKeyword} industry.
      Use the Subject and Body templates as a structural framework (tone, length, call-to-action), but DO NOT just fill in the blanks. Write an intelligent, flowing email that sounds human and industry-specific.
      
      CRITICAL RULE: Your output MUST NOT contain any brackets like {name} or placeholders. DO NOT just copy the Body Template. Write a fresh, unique email.
      If a value is missing, use a generic natural-sounding substitute.
      
      Return the result strictly as a JSON object with EXACTLY "subject" and "body" as lowercase keys. Example:
      {"subject": "hello", "body": "email content"}
    `;

    const response = await executeWithRetry(client => 
      client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      })
    );

    const replacePlaceholders = (text: string) => {
      return text.replace(/{company}|{Company Name}|{City}|{city}|{name}|{Name}|{industry}|{industry}/gi, (match) => {
        const m = match.toLowerCase();
        if (m === '{company}' || m === '{company name}') return lead.company;
        if (m === '{city}') return lead.searchLocation || lead.location;
        if (m === '{name}') return ''; // User requested to remove name
        if (m === '{industry}') return lead.industry || 'your business';
        return '';
      }).replace(/\s+/g, ' ').replace(/Hi ,/g, 'Hi,').trim();
    };

    try {
      const parsed = JSON.parse(response.text?.replace(/```json|```|```javascript/g, '') || "{}");
      const generatedSubject = parsed.subject || parsed.Subject || subject;
      const generatedBody = parsed.body || parsed.Body || parsed.content || parsed.message || parsed.email || template;

      return {
        subject: replacePlaceholders(generatedSubject),
        body: replacePlaceholders(generatedBody)
      };
    } catch {
      // If it returns plain text rather than JSON, assume it is the body
      const generatedBody = response.text || template;
      return {
        subject: replacePlaceholders(subject),
        body: replacePlaceholders(generatedBody)
      };
    }
  } catch (error) {
    console.error("Personalization error:", error);
    const fallbackReplace = (text: string) => {
      return text.replace(/{company}|{Company Name}|{City}|{city}|{name}|{Name}|{industry}/gi, (match) => {
        const m = match.toLowerCase();
        if (m === '{company}' || m === '{company name}') return lead.company;
        if (m === '{city}') return lead.searchLocation || lead.location;
        if (m === '{name}') return '';
        if (m === '{industry}') return lead.industry || 'your business';
        return '';
      }).replace(/Hi ,/g, 'Hi,').trim();
    };
    return {
      subject: fallbackReplace(subject),
      body: fallbackReplace(template)
    };
  }
};

export const discoverLeadsAI = async (niche: string, location: string): Promise<Partial<Lead>[]> => {
  try {
    const response = await apiFetch('/api/leads/discover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ niche, location }),
    });

    if (!response.ok) {
      throw new Error(`Discovery failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Discovery error:", error);
    return [];
  }
};

export const generateNicheSequence = async (niche: string, location: string): Promise<any[]> => {
  try {
    const prompt = `
      Create a professional 5-step B2B outreach sequence for the niche: "${niche}" in "${location}".
      The user wants to use the EXACT SAME structure and tone as their successful "Digital Marketing" campaign, adapted for this new industry.
      
      STRUCTURE & DELAYS:
      Step 1: Day 0. Intro / Quick Question.
      Step 2: Day 2. Problem Awareness.
      Step 3: Day 4. The Solution/Idea (AI-powered lead discovery tool).
      Step 4: Day 6. Local Connection.
      Step 5: Day 8. Final Follow-up.
      
      EXAMPLE TEMPLATES (Follow this style but adapt the niche-specific parts):
      Step 1: "Hi, I'm building an AI tool for ${niche} companies in {City} to help automate their lead generation. I came across {Company Name} and noticed your work... I'd love to show you how we can help you get more clients automatically."
      Step 2: "Hi, many ${niche} businesses spend too much time manually searching for clients. We built a platform that handles this 24/7..."
      
      STRICT RULES:
      - ALWAYS identify as a provider/creator of an AI tool for their industry.
      - NEVER sound like a customer looking for their services. Be crystal clear that YOU are offering a software solution to HELP THEM find more clients automatically.
      - Use a subject line that mentions "outreach automation" or "lead generation tool" to set the context immediately.
      - Use ONLY {Company Name} and {City} as placeholders.
      - NEVER use {Name} or {Industry}. Use the actual niche "${niche}" in the text.
      - Maintain a consultative, professional, and helpful tone.
      - Ensure 5 steps with the 0, 2, 4, 6, 8 day delay structure.
      
      Return as a JSON array of objects with: "step", "day_delay", "template_name", "subject", "body".
    `;

    const response = await executeWithRetry(client => 
      client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      })
    );

    const text = response.text?.replace(/```json|```/g, '') || "[]";
    const data = JSON.parse(text);
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    throw new Error("Returned array was empty or invalid JSON structure.");
  } catch (error) {
    console.error("Sequence generation error:", error);
    return [
                {
                    step: 1,
                    dayDelay: 0,
                    templateName: "Intro",
                    subject: `Streamlining outreach for ${niche}`,
                    body: `Hi {Name},\n\nI noticed {Company Name} is growing and wanted to see if you are actively looking to scale your lead generation in ${location}.\n\nWe build AI-powered outreach tools tailored for ${niche} that automate the discovery and engagement process, running 24/7 without manual effort.\n\nWould you be open to a quick chat to see how this could integrate with {Company Name}?\n\nBest,`
                },
                {
                    step: 2,
                    dayDelay: 2,
                    templateName: "Value Prop",
                    subject: `Re: Streamlining outreach for ${niche}`,
                    body: `Hi again {Name},\n\nFollowing up on my previous note. Many ${niche} businesses spend far too much time manually hunting for contact details or juggling spreadsheets.\n\nOur platform handles both discovery and tailored sequences completely automatically.\n\nLet me know if you have 10 minutes next week to see a quick demo.\n\nCheers,`
                },
                {
                    step: 3,
                    dayDelay: 4,
                    templateName: "Tech Focus",
                    subject: `Quick question about {Company Name}`,
                    body: `Hi {Name},\n\nJust wanted to quickly ask - what are you currently using to source B2B leads right now?\n\nOur system uses real-time web scraping and Gemini AI to guarantee high-intent contacts with validated emails.\n\nHappy to share some case studies if you're interested.`
                },
                {
                    step: 4,
                    dayDelay: 6,
                    templateName: "Local Connect",
                    subject: `Connecting in ${location}`,
                    body: `Hi {Name},\n\nSince you are operating around ${location}, I thought it would be highly relevant to connect. We are specifically helping businesses in your sector improve their pipeline velocity.\n\nAre you the right person to speak with regarding sales operations at {Company Name}?`
                },
                {
                    step: 5,
                    dayDelay: 8,
                    templateName: "Breakup",
                    subject: `Closing the loop`,
                    body: `Hi {Name},\n\nI haven't heard back, so I will assume automated lead generation isn't a priority for {Company Name} right now.\n\nI'll stop following up, but feel free to reach out whenever you're ready to put your SDR tasks on autopilot.\n\nBest regards,`
                }
            ];
  }
};
