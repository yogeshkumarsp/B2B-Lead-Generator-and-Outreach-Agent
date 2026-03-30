
import { Lead, Campaign, AppSettings, AgentLog, LeadStatus, OutreachStatus, LogLevel, LogModule } from "../types";
import { DEFAULT_SETTINGS, SAMPLE_CAMPAIGNS } from "../constants";
import { apiFetch } from "./apiFetch";

class Store {
  private leads: Lead[] = [];
  private campaigns: Campaign[] = [];
  private logs: AgentLog[] = [];
  private settings: AppSettings = DEFAULT_SETTINGS;
  private dashboardData: any = null;

  constructor() {
    this.load();
  }

  private load() {
    const storedLeads = localStorage.getItem('autosdr_leads');
    const storedCampaigns = localStorage.getItem('autosdr_campaigns');
    const storedSettings = localStorage.getItem('autosdr_settings');
    const storedLogs = localStorage.getItem('autosdr_logs');
    const storedDashboard = localStorage.getItem('autosdr_dashboard');

    if (storedLeads) this.leads = JSON.parse(storedLeads);
    if (storedCampaigns) this.campaigns = JSON.parse(storedCampaigns);
    else this.campaigns = SAMPLE_CAMPAIGNS;

    if (storedSettings) this.settings = JSON.parse(storedSettings);
    if (storedLogs) this.logs = JSON.parse(storedLogs);
    if (storedDashboard) this.dashboardData = JSON.parse(storedDashboard);
  }

  private save() {
    localStorage.setItem('autosdr_leads', JSON.stringify(this.leads));
    localStorage.setItem('autosdr_campaigns', JSON.stringify(this.campaigns));
    localStorage.setItem('autosdr_settings', JSON.stringify(this.settings));
    localStorage.setItem('autosdr_logs', JSON.stringify(this.logs));
    localStorage.setItem('autosdr_dashboard', JSON.stringify(this.dashboardData));
  }

  // Leads
  getLeads() { return [...this.leads]; }
  getQualifiedLeads() { return this.leads.filter(l => l.status === LeadStatus.QUALIFIED); }

  addLeads(newLeads: Partial<Lead>[], source: string) {
    const existingNames = new Set(this.leads.map(l => l.name.toLowerCase().trim()));

    // Deduplicate within the new batch first
    const uniqueNewLeads: Partial<Lead>[] = [];
    const newNamesObj = new Set<string>();

    for (const lead of newLeads) {
      const name = (lead.name || '').toLowerCase().trim();
      if (!name) continue;
      if (!existingNames.has(name) && !newNamesObj.has(name)) {
        uniqueNewLeads.push(lead);
        newNamesObj.add(name);
      }
    }

    if (uniqueNewLeads.length === 0) return [];

    const processed: Lead[] = uniqueNewLeads.map(l => {
      const score = l.score || 0;
      const hasEmail = l.email && l.email.includes('@');
      const status = (score >= 70 && hasEmail) ? LeadStatus.QUALIFIED : LeadStatus.HOLD;

      return {
        ...l,
        id: Math.random().toString(36).substr(2, 9),
        source,
        score,
        status,
        outreachStatus: OutreachStatus.PENDING,
        followUpCount: 0,
        createdAt: Date.now(),
      } as Lead;
    });
    this.leads = [...processed, ...this.leads];
    this.save();
    return processed;
  }

  clearLeads() {
    this.leads = [];
    this.save();
  }

  updateLead(id: string, updates: Partial<Lead>) {
    this.leads = this.leads.map(l => l.id === id ? { ...l, ...updates } : l);
    this.save();
  }

  // Campaigns
  getCampaigns() { return [...this.campaigns]; }

  addCampaign(campaign: Omit<Campaign, 'id' | 'createdAt'>) {
    const newCampaign: Campaign = {
      ...campaign,
      id: 'c' + Math.random().toString(36).substr(2, 5),
      createdAt: Date.now(),
    };
    this.campaigns.push(newCampaign);
    this.save();
    return newCampaign;
  }

  updateCampaign(id: string, updates: Partial<Campaign>) {
    this.campaigns = this.campaigns.map(c => c.id === id ? { ...c, ...updates } : c);
    this.save();
  }

  deleteCampaign(id: string) {
    this.campaigns = this.campaigns.filter(c => c.id !== id);
    this.leads = this.leads.map(l => l.campaignId === id ? { ...l, campaignId: undefined } : l);
    this.save();
  }

  // Logs
  getLogs() { return [...this.logs].sort((a, b) => b.timestamp - a.timestamp); }

  addLog(log: Omit<AgentLog, 'id' | 'timestamp'>) {
    const newLog: AgentLog = {
      ...log,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
    };
    this.logs.unshift(newLog);
    // Keep only last 1000 logs locally
    if (this.logs.length > 1000) this.logs.pop();
    this.save();

    // Asynchronously send log to backend DB
    apiFetch('/api/logs', {
      method: 'POST',
      body: JSON.stringify({
        level: newLog.level,
        module: newLog.module,
        message: newLog.message,
        leadId: newLog.leadId,
        campaignId: newLog.campaignId
      })
    }).catch(err => console.error('Failed to save log to DB:', err));
  }

  // Settings
  getSettings() { return { ...this.settings }; }
  updateSettings(updates: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...updates };
    this.save();
  }

  // Dashboard Data
  getDashboardData() { return this.dashboardData; }
  updateDashboardData(data: any) {
    this.dashboardData = data;
    this.save();
  }

  // CSV Export Utils
  exportToCSV(data: any[], filename: string) {
    if (data.length === 0) return;

    // Filter to only professional relevant fields
    const fieldMap: Record<string, string> = {
      companyName: 'Company Name',
      email: 'Email',
      phone: 'Phone',
      website: 'Website',
      address: 'Location',
      industry: 'Industry',
      score: 'Lead Score',
      status: 'Qualified Status'
    };

    const headers = Object.keys(fieldMap);
    const headerRow = headers.map(h => fieldMap[h]).join(',');

    const csvContent = [
      headerRow,
      ...data.map(row =>
        headers.map(h => {
          const val = row[h] || '';
          // Escape quotes and wrap in quotes to handle commas
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const store = new Store();
