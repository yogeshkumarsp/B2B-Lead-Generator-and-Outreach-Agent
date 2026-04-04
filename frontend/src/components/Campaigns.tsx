
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/apiFetch';
import { store } from '../services/store';
import { Card, Button, Input, Badge } from './Common';
import { Campaign, Lead, LeadStatus, LogLevel, LogModule, OutreachStatus } from '../types';
import { agent } from '../services/agent';
import { Zap, Plus, Download, Users, Trash2, Loader2, Circle, Pause, Mail, MessageSquare, ExternalLink, Eye } from 'lucide-react';

const Campaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<any[]>(store.getCampaigns());
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [campaignLeads, setCampaignLeads] = useState<Lead[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(store.getSettings().isAgentEnabled);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);

  // Form State
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTemplate, setNewTemplate] = useState("Hi {{name}},\n\nI noticed your work at {{company}}. I'd love to discuss how we can help you as a {{title}}.\n\nBest, Alex");

  useEffect(() => {
    refreshData();
    const statusInterval = setInterval(() => {
      const isEnabled = store.getSettings().isAgentEnabled;
      setAgentEnabled(isEnabled);
      // Since the agent runs on the backend, we should gently poll the data to keep the UI fresh
      if (isEnabled) {
          refreshData();
      }
    }, 15000); // Polling every 15s to match backend loop
    
    // Exact event listener from manual triggers
    window.addEventListener('agent-update', refreshData);
    
    return () => {
      clearInterval(statusInterval);
      window.removeEventListener('agent-update', refreshData);
    };
  }, []);

  useEffect(() => {
    const openId = localStorage.getItem('openCampaignId');
    if (openId && campaigns.length > 0) {
      const c = campaigns.find(cam => cam.id === openId);
      if (c) {
        handleSelectCampaign(c);
        localStorage.removeItem('openCampaignId');
      }
    }
  }, [campaigns]);

  const handleSelectCampaign = async (c: any) => {
    setSelectedCampaign(c);
    setIsLoadingLeads(true);
    setCampaignLeads([]); // clear previous
    try {
      const res = await apiFetch(`/api/leads?campaignId=${c.id}&limit=all`);
      const data = await res.json();
      setCampaignLeads(data.map((l: any) => ({
        ...l,
        name: l.companyName,
        company: l.companyName,
        location: l.address,
        outreachStatus: (l.outreachStatus as OutreachStatus) || OutreachStatus.PENDING,
        followUpCount: l.followUpCount || 0,
        intent: l.intent || 'LOW',
        status: l.status as LeadStatus,
        lastContactedAt: l.lastContactedAt ? new Date(l.lastContactedAt).getTime() : undefined
      })));
    } catch (err) {
      console.error("Failed to load campaign leads:", err);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const refreshData = async () => {
    try {
      const cRes = await apiFetch('/api/campaigns');
      const cData = await cRes.json();
      setCampaigns(cData);
      store.setCampaigns(cData);
      
      // If a campaign is currently selected, refresh its leads too
      if (selectedCampaign) {
         handleSelectCampaign(selectedCampaign);
      }
    } catch (err) {
      console.error("Fetch failed", err);
    }
  };

  const toggleAgent = () => {
    const newState = !agentEnabled;
    store.updateSettings({ isAgentEnabled: newState });
    setAgentEnabled(newState);
    if (newState) agent.start();
    else agent.stop();
  };

  const handleRunNow = async () => {
    setIsProcessing(true);
    await agent.forceProcess();
    await refreshData();
    setIsProcessing(false);
  };

  const handleCreate = async () => {
    if (!newName) return;
    try {
      await apiFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          description: newDesc,
          steps: [
            {
              step: 1,
              dayDelay: 0,
              subject: `Introduction from ${store.getSettings().senderName || 'AutoSDR'}`,
              body: newTemplate
            }
          ]
        })
      });
      await refreshData();
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
    } catch (err) {
      console.error("Create campaign failed", err);
    }
  };

  const assignLeadsToCampaign = async (campaignId: string) => {
    try {
      await apiFetch(`/api/campaigns/${campaignId}/auto-assign`, { method: 'POST' });
      await refreshData();
      store.addLog({
        level: LogLevel.ACTION,
        module: LogModule.CAMPAIGN,
        message: `Triggered auto-assignment for campaign.`
      });
    } catch (err) {
      console.error("Assignment failed", err);
    }
  };

  const handleExportCampaign = async (c: any) => {
    try {
      // Fetch full leads specifically for export
      const res = await apiFetch(`/api/leads?campaignId=${c.id}&limit=all`);
      const exportLeads = await res.json();
      if (exportLeads.length === 0) {
        alert("No leads assigned to this campaign yet.");
        return;
      }
      store.exportToCSV(exportLeads, `campaign_${c.name.toLowerCase().replace(/\s+/g, '_')}`);
    } catch(e) {
      console.error(e);
      alert("Failed to export. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Outreach Campaigns</h1>
          <p className="text-slate-500">Group leads and define outreach rules.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Agent Status Bar */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold tracking-wide transition-all ${agentEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 shadow-sm'}`}>
            <Circle className={`w-2.5 h-2.5 fill-current ${agentEnabled ? 'animate-pulse' : ''}`} />
            Agent: {agentEnabled ? 'Active' : 'Paused'}
            <button
              onClick={toggleAgent}
              className={`ml-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold transition-colors flex items-center gap-1 ${agentEnabled ? 'bg-emerald-200/50 hover:bg-emerald-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
            >
              {agentEnabled ? 'Pause' : 'Resume'}
            </button>
          </div>

          <Button
            variant="secondary"
            onClick={handleRunNow}
            disabled={!agentEnabled || isProcessing}
            className="h-9 text-sm"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Zap className="w-4 h-4 mr-1.5" />}
            {isProcessing ? 'Processing...' : 'Run Outreach'}
          </Button>

          <Button onClick={() => setShowCreate(true)} className="h-9 text-sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Campaign
          </Button>
        </div>
      </header>

      {showCreate && (
        <Card title="Create New Campaign">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Campaign Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Real Estate - West Coast" className="col-span-1" />
              <Input label="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Brief purpose..." className="col-span-1" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-600">Email Template</label>
              <textarea
                className="w-full px-3 py-2 border border-slate-300 rounded-lg h-32 text-sm focus:ring-2 focus:ring-indigo-500/20"
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
              />
              <p className="text-[10px] text-slate-400">Available variables: {'{{name}}'}, {'{{company}}'}, {'{{title}}'}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Save Campaign</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          {campaigns.map(c => (
            <div
              key={c.id}
              onClick={() => handleSelectCampaign(c)}
              className={`p-4 rounded-xl border cursor-pointer transition-all hover:-translate-y-0.5 ${selectedCampaign?.id === c.id ? 'bg-blue-50/50 border-blue-200 shadow-sm ring-1 ring-blue-500/20' : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-slate-800">{c.name}</h3>
                <Badge variant={c.status === 'ACTIVE' ? 'success' : 'gray'}>{c.status}</Badge>
              </div>
              <p className="text-xs text-slate-500 mb-4 line-clamp-2 leading-relaxed">{c.description}</p>
              <div className="flex items-center justify-between mt-auto">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {c._count?.leads || 0} Leads
                </span>
                <Button
                  variant="ghost"
                  className="!p-1.5 h-8 w-8 rounded-lg bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-100 transition-colors shadow-sm"
                  onClick={(e) => { e.stopPropagation(); handleExportCampaign(c); }}
                  title="Export Leads"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Campaign Detail */}
        <div className="lg:col-span-2">
          {selectedCampaign ? (
            <Card title={`${selectedCampaign.name} Details`}>
              <div className="space-y-6">
                <div className="flex flex-wrap gap-4 p-5 bg-slate-50/80 rounded-xl border border-slate-100">
                  <div className="flex-1 min-w-[120px]">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Targeting</div>
                    <div className="text-xl font-bold text-emerald-600">High Intent</div>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Daily Max Sends</div>
                    <div className="text-xl font-bold text-slate-700">{selectedCampaign.maxDailySends}</div>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Follow-up Days</div>
                    <div className="text-xl font-bold text-slate-700">{selectedCampaign.followUpDelayDays}</div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 md:pt-0">
                    <Button variant="secondary" onClick={() => assignLeadsToCampaign(selectedCampaign.id)} className="h-9 text-xs">
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Auto-Assign
                    </Button>
                    <Button variant="danger" onClick={async () => {
                      if (confirm(`Are you sure you want to delete "${selectedCampaign.name}"? This will PERMANENTLY delete the campaign and all ${selectedCampaign._count?.leads || 0} leads assigned to it.`)) {
                        await apiFetch(`/api/campaigns/${selectedCampaign.id}`, { method: 'DELETE' });
                        await refreshData();
                        setSelectedCampaign(null);
                        store.addLog({
                          level: LogLevel.WARNING,
                          module: LogModule.CAMPAIGN,
                          message: `Campaign deleted: ${selectedCampaign.name}`
                        });
                      }
                    }} className="h-9 text-xs">
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-blue-600" />
                    Leads in this Campaign
                  </h4>
                  <div className="border border-slate-100 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-bold">
                        <tr>
                          <th className="px-4 py-2">Lead Name</th>
                          <th className="px-4 py-2">Company</th>
                          <th className="px-4 py-2">Status</th>
                          <th className="px-4 py-2 text-center">Step</th>
                          <th className="px-4 py-2 text-center">Intent</th>
                          <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignLeads.map(l => (
                          <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-medium text-slate-800">{l.name}</td>
                            <td className="px-4 py-3 text-slate-600">{l.company}</td>
                            <td className="px-4 py-3">
                              <Badge variant={
                                l.outreachStatus === OutreachStatus.SENT ? 'info' :
                                  l.outreachStatus === OutreachStatus.REPLIED ? 'success' :
                                    l.outreachStatus === OutreachStatus.IN_PROGRESS ? 'warning' : 'gray'
                              }>
                                {l.outreachStatus}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                                {l.currentStep || 1}/5
                              </span>
                            </td>
                             <td className="px-4 py-3 text-center">
                              <Badge variant={l.intent === 'HIGH' ? 'success' : 'gray'}>
                                {l.intent || 'LOW'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {l.outreachMessage && (
                                <Button
                                  variant="ghost"
                                  className="h-8 w-8 !p-0 text-indigo-600 hover:bg-indigo-50"
                                  onClick={() => setViewingLead(l)}
                                  title="View Personalized Message"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {isLoadingLeads ? (
                          <tr><td colSpan={6} className="p-8 text-center text-slate-400">Loading leads...</td></tr>
                        ) : campaignLeads.length === 0 ? (
                          <tr><td colSpan={6} className="p-8 text-center text-slate-400">No leads assigned.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
              Select a campaign to view details.
            </div>
          )}
        </div>
      </div>

      {/* Message Viewer Modal */}
      {viewingLead && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-600" />
                  Personalized Outreach for {viewingLead.company}
                </h3>
                <p className="text-xs text-slate-500 mt-1">Generated by AutoSDR Gemini Agent</p>
              </div>
              <Button variant="ghost" onClick={() => setViewingLead(null)} className="h-8 w-8 !p-0">✕</Button>
            </div>

            <div className="p-6">
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap font-serif italic h-[400px] overflow-y-auto shadow-inner">
                {viewingLead.outreachMessage}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <Button
                  className="bg-[#25D366] hover:bg-[#128C7E] text-white border-none h-12 flex items-center justify-center gap-2 text-sm shadow-md"
                  onClick={() => {
                    const phone = viewingLead.phone.replace(/\D/g, '');
                    const text = encodeURIComponent(viewingLead.outreachMessage || '');
                    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
                  }}
                >
                  <MessageSquare className="w-5 h-5 fill-current" />
                  Send via WhatsApp
                </Button>

                <Button
                  className="bg-red-600 hover:bg-red-700 text-white border-none h-12 flex items-center justify-center gap-2 text-sm shadow-md"
                  onClick={() => {
                    const subject = encodeURIComponent(`Regarding your work at ${viewingLead.company}`);
                    const body = encodeURIComponent(viewingLead.outreachMessage || '');
                    window.open(`mailto:${viewingLead.email}?subject=${subject}&body=${body}`, '_blank');
                  }}
                >
                  <Mail className="w-5 h-5" />
                  Send via Email
                </Button>
              </div>

              <p className="text-[10px] text-center text-slate-400 mt-4 italic">
                Note: This will open your local browser's default apps for security and privacy.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Campaigns;
