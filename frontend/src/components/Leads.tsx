
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/apiFetch';
import { store } from '../services/store';
import { discoverLeadsAI, generateNicheSequence } from '../services/gemini';
import { Card, Button, Input, Badge } from './Common';
import { Lead, LeadStatus, LogLevel, LogModule, OutreachStatus } from '../types';
import { agent } from '../services/agent';
import { Download, Trash2, Search, Loader2, Layers } from 'lucide-react';

const Leads: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [agentEnabled, setAgentEnabled] = useState(store.getSettings().isAgentEnabled);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [campaignIdToAssign, setCampaignIdToAssign] = useState<string>('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set(JSON.parse(localStorage.getItem('dismissedLeadIds') || '[]')));
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const loadLeads = () => {
    setIsLoading(true);
    setIsError(false);
    apiFetch('/api/leads')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const mapped = data.map(d => ({
            ...d,
            name: d.companyName,
            company: d.companyName,
            location: d.address,
            searchLocation: d.searchLocation,
            title: 'Decision Maker',
            source: 'Postgres DB',
            status: d.status || LeadStatus.UNPROCESSED,
            outreachStatus: (d.outreachStatus as OutreachStatus) || OutreachStatus.PENDING,
            followUpCount: d.followUpCount || 0,
            intent: d.intent || 'LOW'
          }));

          setLeads(mapped);
        } else {
          setIsError(true);
        }
      })
      .then(() => apiFetch('/api/campaigns'))
      .then(res => res.json())
      .then(cData => {
        if (Array.isArray(cData)) setCampaigns(cData);
      })
      .catch(err => {
        console.error("Failed to load leads from DB:", err);
        setIsError(true);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadLeads();
    
    // Update live when the background agent makes changes
    window.addEventListener('agent-update', loadLeads);
    return () => window.removeEventListener('agent-update', loadLeads);
  }, []);

  const visibleLeads = leads.filter(l => !dismissedIds.has(l.id));

  const toggleAgent = async () => {
    const newState = !agentEnabled;
    try {
      // 1. Update UI state immediately
      setAgentEnabled(newState);
      
      // 2. Persist to localStorage/store for frontend-specific logic
      store.updateSettings({ isAgentEnabled: newState });
      
      // 3. Persist to backend database for the Background Agent to see
      await apiFetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAgentEnabled: newState })
      });

      store.addLog({
        level: LogLevel.INFO,
        module: LogModule.AGENT,
        message: `Autonomous Agent ${newState ? 'Enabled' : 'Disabled'} (Synced to DB).`
      });

      // 4. Start/Stop local interval if needed (though the backend handles the real work)
      if (newState) agent.start();
      else agent.stop();
    } catch (err) {
      console.error("Failed to sync agent state to DB:", err);
      // Revert UI state on failure
      setAgentEnabled(!newState);
      store.updateSettings({ isAgentEnabled: !newState });
    }
  };

  const handleDiscovery = async () => {
    if (!niche || !location) return;

    setIsDiscovering(true);
    store.addLog({
      level: LogLevel.INFO,
      module: LogModule.DISCOVERY,
      message: `Starting discovery for "${niche}" in "${location}"`
    });

    try {

      const newLeadsRaw = await discoverLeadsAI(niche, location);

      // Update dismissed IDs: remove any IDs that were just discovered so they show up again
      const newlyDiscoveredIds = newLeadsRaw.map(l => l.id as string).filter(id => !!id);
      const nextDismissed = new Set(dismissedIds);
      let changed = false;
      newlyDiscoveredIds.forEach(id => {
        if (nextDismissed.has(id)) {
          nextDismissed.delete(id);
          changed = true;
        }
      });

      if (changed) {
        setDismissedIds(nextDismissed);
        localStorage.setItem('dismissedLeadIds', JSON.stringify(Array.from(nextDismissed)));
      }

      // 1. Identify qualified leads
      const qualifiedLeads = newLeadsRaw.filter(l => l.intent === 'HIGH');

      if (qualifiedLeads.length > 0) {
        const campaignName = `${niche} - ${location}`;

        try {
          // 2. Generate customized 5-step sequence for this niche
          let activeSequence = await generateNicheSequence(niche, location);

          if (!activeSequence || activeSequence.length === 0) {
            // Fallback to a generic but structurally correct 5-step sequence
            activeSequence = [
              {
                step: 1, day_delay: 0, template_name: "intro",
                subject: "Question about {Company Name}'s outreach automation",
                body: `Hi,\n\nI came across {Company Name} while researching ${niche} in {City}. \n\nI’m the creator of an AI-powered lead generation tool, and I'm reaching out to see if your team is looking to automate your B2B outreach and prospect discovery.\n\nWould love to hear how you currently handle this and if our automation could help.\n\nBest regards,\nYogesh Kumar`
              },
              {
                step: 2, day_delay: 2, template_name: "problem",
                subject: `Automating lead discovery for ${niche}`,
                body: "Hi,\n\nMany companies in your industry spend hours manually finding and scoring leads. \n\nWe built an AI platform that handles this discovery 24/7 so you can focus on closing deals.\n\nCurious to know — how does {Company Name} currently generate new B2B leads?\n\nBest regards,\nYogesh Kumar"
              },
              {
                step: 3, day_delay: 4, template_name: "idea",
                subject: "Our AI agent for {Company Name}",
                body: "Hi,\n\nI’m developing an AI agent platform specifically for personalized B2B outreach.\n\nSince you’re at {Company Name}, I thought you'd be interested in seeing how we automate the entire top-of-funnel process.\n\nDo you think a tool like this could help your sales team?\n\nBest regards,\nYogesh Kumar"
              },
              {
                step: 4, day_delay: 6, template_name: "local",
                subject: `Connecting with ${niche} in {City}`,
                body: `Hi,\n\nI’m currently connecting with a few businesses in {City} to show how our AI tools help automate B2B lead generation.\n\nI'd love to share how {Company Name} can find more clients automatically.\n\nBest regards,\nYogesh Kumar`
              },
              {
                step: 5, day_delay: 8, template_name: "final",
                subject: "Final follow-up: outreach automation",
                body: `Hi,\n\nJust checking again — how does {Company Name} currently find new B2B clients? \n\nIf you're interested in automating your lead generation with AI, I'd love to chat.\n\nBest regards,\nYogesh Kumar`
              }
            ];
          }

          // 3. Create campaign with steps
          const cRes = await apiFetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: campaignName,
              description: `Automated 5-step sequence for ${niche} in ${location}`,
              steps: activeSequence
            })
          });
          const campaign = await cRes.json();

          // 4. Auto-assign leads
          await apiFetch(`/api/campaigns/${campaign.id}/auto-assign`, { method: 'POST' });

          store.addLog({
            level: LogLevel.ACTION,
            module: LogModule.CAMPAIGN,
            message: `Zero-Click Automation: Created 5-step campaign "${campaignName}" and assigned ${qualifiedLeads.length} leads.`
          });

          // 5. Trigger agent immediately
          agent.forceProcess();
        } catch (err) {
          console.error("Zero-Click automation failed:", err);
        }
      }

      // Refresh leads from the database
      const refreshRes = await apiFetch('/api/leads');
      const lData = await refreshRes.json();
      if (Array.isArray(lData)) {
        const mapped = lData.map((d: any) => ({
          ...d,
          name: d.companyName,
          company: d.companyName,
          location: d.address,
          searchLocation: d.searchLocation,
          title: 'Decision Maker',
          source: 'Postgres DB',
          status: (d.status as LeadStatus) || LeadStatus.UNPROCESSED,
          outreachStatus: (d.outreachStatus as OutreachStatus) || OutreachStatus.PENDING,
          outreachMessage: d.outreachMessage,
          followUpCount: d.followUpCount || 0,
          intent: d.intent || 'LOW',
          lastContactedAt: d.lastContactedAt ? new Date(d.lastContactedAt).getTime() : undefined
        }));

        // Filter out ONLY explicitly dismissed leads
        setLeads(mapped.filter(l => !dismissedIds.has(l.id)));

        // Refresh campaigns
        const cRes = await apiFetch('/api/campaigns');
        const campData = await cRes.json();
        if (Array.isArray(campData)) setCampaigns(campData);
      }

    } catch (err) {
      console.error("Discovery process failed:", err);
    } finally {
      setIsDiscovering(false);
      setNiche('');
      setLocation('');
    }
  };

  const handleExportQualified = () => {
    const qualified = leads.filter(l => l.status === LeadStatus.QUALIFIED || l.intent === 'HIGH');
    if (qualified.length === 0) {
      alert("No qualified leads to export yet.");
      return;
    }
    store.exportToCSV(qualified, 'qualified_leads');
    store.addLog({
      level: LogLevel.INFO,
      module: LogModule.EXPORT,
      message: `Exported ${qualified.length} qualified leads to CSV.`
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map(l => l.id)));
    }
  };

  const toggleSelectLead = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAssign = async () => {
    if (!campaignIdToAssign || selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    await Promise.all(ids.map(id =>
      apiFetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaignIdToAssign })
      })
    ));

    const campaignName = campaigns.find(c => c.id === campaignIdToAssign)?.name || 'Campaign';

    store.addLog({
      level: LogLevel.ACTION,
      module: LogModule.CAMPAIGN,
      message: `Mass assigned ${selectedIds.size} leads to campaign: ${campaignName}`
    });

    setSelectedIds(new Set());
    setCampaignIdToAssign('');
    await loadLeads(); // Reload from DB to reflect changes
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.size} lead(s)?`)) return;

    try {
      const ids = Array.from(selectedIds);
      await apiFetch('/api/leads/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });

      store.addLog({
        level: LogLevel.ACTION,
        module: LogModule.AGENT,
        message: `Permanently deleted ${selectedIds.size} lead(s).`
      });

      setSelectedIds(new Set());
      await loadLeads();
    } catch (error) {
       console.error("Failed to delete leads:", error);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Lead Management</h1>
          <p className="text-slate-500">Discover and manage your B2B prospect pool.</p>
        </div>
        <div className="flex gap-3 items-center">
          {/* Enhanced Agent Toggle */}
          <div
            onClick={toggleAgent}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg border cursor-pointer transition-all duration-200 ${agentEnabled ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm'}`}
          >
            <div className="relative">
              <div className={`w-2.5 h-2.5 rounded-full ${agentEnabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse' : 'bg-slate-300'}`} />
            </div>
            <div className="flex flex-col">
              <span className={`text-sm font-semibold ${agentEnabled ? 'text-emerald-700' : 'text-slate-600'}`}>
                Agent: {agentEnabled ? 'Running' : 'Paused'}
              </span>
            </div>
            <div className={`ml-2 w-9 h-5 rounded-full relative transition-colors duration-300 ${agentEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}>
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${agentEnabled ? 'left-5' : 'left-1'}`} />
            </div>
          </div>


          <Button
            className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-md"
            onClick={handleExportQualified}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Qualified
          </Button>
          <Button variant="danger" onClick={() => {
            if (confirm('Clear the leads from this section? They will remain saved in the database and active in their campaigns.')) {
              const currentIds = leads.map(l => l.id);
              const nextDismissed = new Set([...Array.from(dismissedIds), ...currentIds]);
              setDismissedIds(nextDismissed);
              localStorage.setItem('dismissedLeadIds', JSON.stringify(Array.from(nextDismissed)));
              setLeads([]);

              store.addLog({
                level: LogLevel.INFO,
                module: LogModule.AGENT,
                message: `Leads section cleared (UI reset). Records preserved in Neon.`
              });
            }
          }} className="h-10">
            <Trash2 className="w-4 h-4 mr-2" />
            Clear From View
          </Button>
        </div>
      </header>

      {/* Discovery Module */}
      <Card title="Lead Discovery">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <Input
            label="Niche / Industry"
            placeholder="e.g. Fintech Startups, SaaS Companies"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="flex-1"
          />
          <Input
            label="Location"
            placeholder="e.g. San Francisco, London, Remote"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="primary"
            onClick={handleDiscovery}
            disabled={isDiscovering || !niche || !location}
            className="md:w-48 h-[42px]"
          >
            {isDiscovering ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Discovering...</>
            ) : (
              <><Search className="w-4 h-4" /> Run Discovery</>
            )}
          </Button>
        </div>
      </Card>

      {/* Leads Table */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 w-10">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    checked={leads.length > 0 && selectedIds.size === leads.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Company Name</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Website</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Address</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center min-w-[100px]">Intent</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleLeads.length > 0 ? visibleLeads.map(lead => (
                <tr key={lead.id} className={`transition-colors ${selectedIds.has(lead.id) ? 'bg-blue-50/50' : 'hover:bg-slate-50 cursor-pointer'}`}>
                  <td className="px-5 py-3 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleSelectLead(lead.id)}
                    />
                  </td>
                  <td className="px-6 py-3 font-semibold text-slate-800">{lead.company}</td>
                  <td className="px-6 py-3 text-slate-600 text-sm">{lead.phone || '--'}</td>
                  <td className="px-6 py-3">
                    <a href={`mailto:${lead.email}`} className="text-blue-600 hover:text-blue-800 hover:underline text-sm">{lead.email}</a>
                  </td>
                  <td className="px-6 py-3">
                    {lead.website ? (
                      <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline text-sm truncate max-w-[120px] inline-block">
                        {lead.website}
                      </a>
                    ) : (
                      <span className="text-slate-400 text-sm">--</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-600 text-sm max-w-[200px] truncate" title={lead.location}>{lead.location}</td>
                  <td className="px-6 py-3 text-center">
                    <Badge variant={lead.intent === 'HIGH' ? 'success' : 'gray'}>
                      {lead.intent || 'LOW'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <Badge variant={
                      lead.status === LeadStatus.QUALIFIED ? 'success' :
                        lead.status === LeadStatus.REJECTED ? 'danger' :
                          lead.status === LeadStatus.HOLD ? 'warning' : 'gray'
                    }>
                      {lead.status}
                    </Badge>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    {isLoading ? (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span>Connecting to database...</span>
                      </div>
                    ) : isError ? (
                      <div className="flex flex-col items-center gap-4 text-red-500">
                        <div className="flex flex-col items-center">
                          <span className="font-bold">Failed to load leads</span>
                          <span className="text-xs">There was an error communicating with the server. Please refresh or sign in again.</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Search className="w-12 h-12 opacity-10 mb-2" />
                        <span>No leads found. Use the discovery tool above to start.</span>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-5 z-50">
          <div className="flex items-center gap-3 border-r border-slate-700 pr-5">
            <span className="bg-blue-600 text-white w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold">
              {selectedIds.size}
            </span>
            <span className="text-sm font-semibold text-slate-200">Leads Selected</span>
          </div>

          <div className="flex items-center gap-3">
            <select
              className="bg-slate-800 text-white border-slate-700 text-sm rounded-lg px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500 border outline-none"
              value={campaignIdToAssign}
              onChange={(e) => setCampaignIdToAssign(e.target.value)}
            >
              <option value="">Select Campaign...</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <Button
              variant="primary"
              className="!py-1.5 !px-3 text-sm flex gap-2"
              disabled={!campaignIdToAssign}
              onClick={handleBulkAssign}
            >
              <Layers className="w-3.5 h-3.5" />
              Assign
            </Button>

            <Button
              variant="danger"
              className="!py-1.5 !px-3 text-sm flex gap-2 border-none"
              onClick={handleBulkDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>

            <Button
              variant="ghost"
              className="!py-1.5 !px-3 text-sm text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={() => setSelectedIds(new Set())}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leads;
