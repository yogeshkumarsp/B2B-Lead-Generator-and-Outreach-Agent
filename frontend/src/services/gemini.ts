
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
      
      // If it's a quota error (429) and specifically "limit: 0" (daily limit), trigger global cool-down
      if (status === 429 && (msg.includes('limit: 0') || msg.includes('quota exceeded'))) {
          console.error(`[AI] GLOBAL QUOTA EXHAUSTED on key ${idx+1}. Entering cool-down for 2 minutes.`);
          globalCoolDownUntil = Date.now() + (2 * 60 * 1000); // 2 minutes cool-down (usually per-minute limits)
          throw new AICoolDownError(getAICoolDownRemaining());
      }

      if (status === 429 || status === 403 || msg.includes('quota') || msg.includes('limit')) {
        console.warn(`[AI] Key ${idx + 1}/${keys.length} failed with status ${status}. Rotating...`);
        continue;
      }
      throw error; // Rethrow if it's not a rate limit/quota error
    }
  }
  
  throw lastError || new Error('All API keys failed');
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
    return JSON.parse(text);
  } catch (error) {
    console.error("Sequence generation error:", error);
    return [];
  }
};
