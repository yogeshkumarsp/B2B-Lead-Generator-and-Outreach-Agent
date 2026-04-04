
export const DEFAULT_SETTINGS = {
  senderName: "Yogesh Kumar",
  senderEmail: "yogeshkumarsp03@gmail.com",
  agentPersona: "You are a Sales Development Representative for AutoSDR. Your goal is to help businesses automate their client acquisition. Maintain a brief, professional, and results-oriented tone.",
  dailySendLimit: 100,
  hourlyThrottleLimit: 50,
  replyDetectionIntervalMinutes: 30,
  isAgentEnabled: false,
};

export const SAMPLE_CAMPAIGNS = [
  {
    id: 'c1',
    name: 'IT Services Outreach',
    description: 'Targeting IT decision makers for automation services.',
    template: "Hi {name},\n\nI came across {company} while researching. Would love to discuss how we can help you automate your outreach.\n\nBest,\nYogesh Kumar",
    followUpDelayDays: 2,
    maxDailySends: 50,
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
