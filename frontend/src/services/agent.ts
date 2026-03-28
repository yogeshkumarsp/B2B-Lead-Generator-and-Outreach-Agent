import { apiFetch } from "./apiFetch";

export class AutoSDRAgent {
  start() {
    // The agent now runs constantly on the backend. The frontend no longer manages the interval.
    // Toggling the settings in the DB is enough to start/stop the backend processing.
  }

  stop() {
    // No-op. Backend handles pausing when DB state changes.
  }

  async forceProcess() {
    try {
      const res = await apiFetch('/api/outreach/run-now', {
        method: 'POST'
      });
      if (!res.ok) throw new Error("Failed to manually trigger outreach agent");
      
      // Wait a moment for background processing to log some immediate initial entries
      await new Promise(resolve => setTimeout(resolve, 1500));
      window.dispatchEvent(new Event('agent-update'));
    } catch (error) {
      console.error("Agent process error:", error);
    }
  }
}

export const agent = new AutoSDRAgent();
