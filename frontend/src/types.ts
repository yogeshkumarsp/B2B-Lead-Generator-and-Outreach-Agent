
export enum LeadStatus {
  QUALIFIED = 'QUALIFIED',
  REJECTED = 'REJECTED',
  UNQUALIFIED = 'UNQUALIFIED',
  HOLD = 'HOLD'
}

export enum OutreachStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  SENT = 'SENT',
  REPLIED = 'REPLIED',
  REPLIED_POSITIVE = 'REPLIED_POSITIVE',
  STOPPED = 'STOPPED'
}

export enum LogLevel {
  INFO = 'INFO',
  ACTION = 'ACTION',
  WARNING = 'WARNING',
  ERROR = 'ERROR'
}

export enum LogModule {
  DISCOVERY = 'DISCOVERY',
  SCORING = 'SCORING',
  CAMPAIGN = 'CAMPAIGN',
  OUTREACH = 'OUTREACH',
  FOLLOWUP = 'FOLLOWUP',
  EXPORT = 'EXPORT',
  AGENT = 'AGENT'
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  location: string;
  searchLocation?: string; // Original search query location
  searchNiche?: string; // Original search query niche
  source: string;
  status: LeadStatus;
  campaignId?: string;
  outreachStatus: OutreachStatus;
  outreachMessage?: string;
  currentStep?: number;
  followUpCount: number;
  lastContactedAt?: number;
  intent?: 'HIGH' | 'LOW';
  createdAt?: number;
}

export interface CampaignStep {
  id: string;
  campaignId: string;
  step: number;
  dayDelay: number;
  templateName?: string;
  subject: string;
  body: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  followUpDelayDays: number;
  maxDailySends: number;
  status: 'ACTIVE' | 'PAUSED';
  createdAt: number;
  steps?: CampaignStep[];
}

export interface AgentLog {
  id: string;
  timestamp: number;
  level: LogLevel;
  module: LogModule;
  message: string;
  leadId?: string;
  campaignId?: string;
}

export interface AppSettings {
  senderName?: string;
  senderEmail?: string;
  agentPersona: string;
  dailySendLimit: number;
  hourlyThrottleLimit: number;
  replyDetectionIntervalMinutes: number;
  isAgentEnabled: boolean;
}

export interface DashboardMetrics {
  totalLeads: number;
  qualifiedLeadsCount: number;
  outreachSentCount: number;
  repliesCount: number;
  averageScore: number;
  interestedLeadsCount: number;
  pendingFollowUpsCount: number;
  activeCampaignsCount: number;
}
