
export const DEFAULT_SETTINGS = {
  senderName: "Yogesh Kumar",
  senderEmail: "yogesh@autosdr.com",
  agentPersona: "You are a Sales Development Representative for AutoSDR, an AI-powered lead generation platform. Your goal is to help IT service companies automate their client acquisition. Always identify as the creator/provider of this automation tool. Maintain a brief, professional, and results-oriented tone.",
  dailySendLimit: 50,
  hourlyThrottleLimit: 5,
  replyDetectionIntervalMinutes: 30,
  isAgentEnabled: false,
};

export const SAMPLE_CAMPAIGNS = [
  {
    id: 'c1',
    name: 'SaaS Decision Makers',
    description: 'Targeting CTOs and VPs of Engineering at high-growth SaaS companies.',
    scoreThreshold: 70,
    template: "Hi {{name}},\n\nI noticed your work at {{company}}. Given your role as {{title}}, I thought you might be interested in how we're streamlining B2B outreach.\n\nBest,\nAlex",
    followUpDelayDays: 3,
    maxDailySends: 20,
    status: 'ACTIVE' as const,
    createdAt: Date.now(),
  }
];

export const COLORS = {
  primary: '#4f46e5', // indigo-600
  secondary: '#0ea5e9', // sky-500
  success: '#22c55e', // green-500
  warning: '#f59e0b', // amber-500
  danger: '#ef4444', // red-500
};
