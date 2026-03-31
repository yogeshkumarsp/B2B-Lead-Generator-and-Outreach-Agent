import { apiFetch } from "./apiFetch";
import { Lead, AppSettings } from "../types";

export const generatePersonalizedEmail = async (
  lead: Lead,
  template: string,
  subject: string,
  settings: AppSettings
): Promise<{ subject: string; body: string }> => {
  try {
    const res = await apiFetch('/api/ai/personalize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lead,
        template,
        subjectTemplate: subject
      }),
    });

    if (!res.ok) throw new Error('Personalization failed');
    return await res.json();
  } catch (error) {
    console.error("Personalization error:", error);
    // Basic fallback replacement logic if backend fails
    const fallback = (text: string) => text.replace(/{company}|{name}|{industry}/gi, lead.company || '');
    return {
      subject: fallback(subject),
      body: fallback(template)
    };
  }
};

export const generateNicheSequence = async (niche: string, location: string): Promise<any[]> => {
  try {
    const res = await apiFetch('/api/ai/sequence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ niche, location }),
    });

    if (!res.ok) throw new Error('Sequence generation failed');
    return await res.json();
  } catch (error) {
    console.error("Sequence generation error:", error);
    return [];
  }
};

export const discoverLeadsAI = async (niche: string, location: string): Promise<any[]> => {
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
  
      const data = await response.json();
      return data.jobId ? [] : data; // Return empty if job started, results if synchronous
    } catch (error) {
      console.error("Discovery error:", error);
      return [];
    }
};
