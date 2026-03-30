import React, { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '../services/apiFetch';
import { store } from '../services/store';
import { Card, Badge } from './Common';
import { DashboardMetrics, OutreachStatus, LeadStatus, Lead, Campaign } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserCheck, Send, Reply, Star, Clock, Layers, TrendingUp, AlertCircle, Info, CheckCircle, Search, Download, X, ArrowLeft } from 'lucide-react';

const Dashboard: React.FC = () => {
  const mapLead = (l: any) => ({
    ...l,
    name: l.companyName,
    company: l.companyName,
    location: l.address,
    outreachStatus: (l.outreachStatus as OutreachStatus) || OutreachStatus.PENDING,
    status: (l.status as LeadStatus) || LeadStatus.UNQUALIFIED,
    lastContactedAt: l.lastContactedAt ? new Date(l.lastContactedAt).getTime() : undefined,
    intent: l.intent || 'LOW'
  });

  const [metrics, setMetrics] = useState(store.getDashboardData()?.metrics || { highIntent: 0, lowIntent: 0, sent: 0, replies: 0, interested: 0, pending: 0, activeCampaigns: 0 });
  const [hotLeads, setHotLeads] = useState<Lead[]>(store.getDashboardData()?.hotLeads ? store.getDashboardData().hotLeads.map(mapLead) : []);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]); // specifically for the modal dropdown
  const [activeCampaigns, setActiveCampaigns] = useState<Campaign[]>(store.getDashboardData()?.activeCampaigns || []);
  const [recentLogs, setRecentLogs] = useState(store.getLogs().slice(0, 10));
  const [selectedMetric, setSelectedMetric] = useState<{ id: string; title: string; leads: Lead[]; loading?: boolean } | null>(null);
  const [selectedCampaignInModal, setSelectedCampaignInModal] = useState<string | null>(null);
  // Only show loading if we have NO cached data
  const [isLoading, setIsLoading] = useState(!store.getDashboardData());

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [dashRes, campRes] = await Promise.all([
           apiFetch('/api/dashboard'),
           apiFetch('/api/campaigns') // Keep fetching campaigns for the dropdown mappings
        ]);
        const data = await dashRes.json();
        const campData = await campRes.json();
        
        // Update Local Cache for "Instant" feel on next refresh
        store.updateDashboardData(data);

        setMetrics(data.metrics || { highIntent: 0, lowIntent: 0, sent: 0, replies: 0, interested: 0, pending: 0, activeCampaigns: 0 });
        setHotLeads(data.hotLeads ? data.hotLeads.map(mapLead) : []);
        setActiveCampaigns(data.activeCampaigns || []);
        setCampaigns(campData || []);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    const logInterval = setInterval(() => {
      setRecentLogs(store.getLogs().slice(0, 10));
    }, 5000);

    // Completely replace polling with an exact event listener from the agent
    window.addEventListener('agent-update', fetchData);

    return () => {
      clearInterval(logInterval);
      window.removeEventListener('agent-update', fetchData);
    };
  }, []);

  // Deleted useMemo blocks (since backend now returns this accurately)

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good night';
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getLogIcon = (module: string) => {
    switch (module) {
      case 'discovery': return <Search className="w-4 h-4" />;
      case 'campaign': return <Layers className="w-4 h-4" />;
      case 'outreach': return <Send className="w-4 h-4" />;
      case 'export': return <Download className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const statCards = useMemo(() => [
    { id: 'high-intent', label: 'High-Intent Leads', value: metrics.highIntent, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50/80 border border-blue-100/50' },
    { id: 'low-intent', label: 'Low-Intent Leads', value: metrics.lowIntent, icon: UserCheck, color: 'text-indigo-600', bg: 'bg-indigo-50/80 border border-indigo-100/50' },
    { id: 'sent', label: 'Outreach Sent', value: metrics.sent, icon: Send, color: 'text-sky-600', bg: 'bg-sky-50/80 border border-sky-100/50' },
    { id: 'replies', label: 'Replies', value: metrics.replies, icon: Reply, color: 'text-emerald-600', bg: 'bg-emerald-50/80 border border-emerald-100/50' },
    { id: 'interested', label: 'Interested', value: metrics.interested || 0, icon: Star, color: 'text-amber-500', bg: 'bg-amber-50/80 border border-amber-100/50' },
    { id: 'pending', label: 'Pending F/U', value: metrics.pending || 0, icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50/80 border border-violet-100/50' },
    { id: 'active-campaigns', label: 'Active Campaigns', value: metrics.activeCampaigns || 0, icon: Layers, color: 'text-rose-600', bg: 'bg-rose-50/80 border border-rose-100/50' }
  ], [metrics]);

  const handleMetricClick = async (id: string, label: string) => {
    if (!id) return;
    
    // Show modal instantly with loading state
    setSelectedMetric({ id, title: label, leads: [], loading: true });
    setSelectedCampaignInModal(null);

    try {
      const res = await apiFetch(`/api/leads?metricType=${id}&limit=all`);
      const data = await res.json();
      setSelectedMetric({ id, title: label, leads: data.map(mapLead), loading: false });
    } catch (err) {
      console.error("Failed to load modal details:", err);
      setSelectedMetric({ id, title: label, leads: [], loading: false });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-8 pb-20 max-w-[1600px] mx-auto"
    >
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 py-2">
        <div className="max-w-3xl">
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.1] mb-4"
          >
            Built for <span className="text-blue-600">high-impact</span> outreach
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg md:text-xl text-slate-500 font-medium leading-relaxed"
          >
            Unite your strategy, leads, and outreach on one powerful platform.
            Automate workflows and drive outcomes at speed and scale.
          </motion.p>
        </div>
      </header>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {statCards.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i, duration: 0.4 }}
            whileHover={{ y: -2, transition: { duration: 0.2 } }}
            onClick={() => m.id && handleMetricClick(m.id, m.label)}
            className={m.id ? "cursor-pointer" : ""}
          >
            <Card variant="premium" className={`!p-0 border border-slate-200 bg-white transition-all overflow-hidden h-full ${m.id ? 'hover:border-blue-300 hover:shadow-lg' : 'hover:border-slate-300 hover:shadow-md'}`}>
              <div className="flex flex-col items-center justify-center py-7 px-2 text-center h-full space-y-2">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${m.bg} ${m.color}`}>
                  <m.icon className="w-5 h-5" strokeWidth={2.5} />
                </div>
                <div className="flex flex-col items-center pt-1">
                  {isLoading ? (
                    <div className="h-9 w-12 bg-slate-200/70 animate-pulse rounded my-0.5"></div>
                  ) : (
                    <div className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">{m.value}</div>
                  )}
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{m.label}</div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card title="Live Activity Feed" variant="premium" className="lg:col-span-1 border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4">
            <AnimatePresence>
              {recentLogs.length > 0 ? recentLogs.map((log, i) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-4 group"
                >
                  <div className="flex flex-col items-center pt-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${log.level === 'error' ? 'bg-red-50 border-red-100 text-red-500' :
                      log.level === 'action' ? 'bg-emerald-50 border-emerald-100 text-emerald-500' :
                        'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                      {log.level === 'error' ? <AlertCircle className="w-4 h-4" /> : log.level === 'action' ? <CheckCircle className="w-4 h-4" /> : getLogIcon(log.module)}
                    </div>
                    {i !== recentLogs.length - 1 && <div className="w-px h-full bg-slate-200/60 mt-2 mb-1" />}
                  </div>
                  <div className="pb-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                      {log.module}
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      <span className="font-medium text-slate-400 normal-case">{getTimeAgo(log.timestamp)}</span>
                    </div>
                    <div className="text-sm text-slate-700 leading-snug">{log.message}</div>
                  </div>
                </motion.div>
              )) : (
                <div className="text-center py-12 text-slate-400 flex flex-col items-center justify-center">
                  <Clock className="w-8 h-8 mb-3 opacity-20" />
                  <span>Waiting for activity...</span>
                </div>
              )}
            </AnimatePresence>
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {/* Active Campaigns */}
          <Card title="Active Campaigns" variant="premium" className="border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50 animate-pulse">
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                      <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))
              ) : activeCampaigns.length > 0 ? activeCampaigns.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.005, backgroundColor: '#f8fafc' }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white transition-all group cursor-pointer"
                  onClick={() => {
                    localStorage.setItem('openCampaignId', c.id);
                    window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'campaigns' }));
                  }}
                >
                  <div className="relative z-10 flex-1">
                    <div className="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"></div>
                      {c.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 truncate max-w-[400px]">{c.description}</div>
                  </div>
                  <div className="text-right relative z-10">
                    <Badge variant="success">Active</Badge>
                    <div className="text-[10px] text-slate-400 mt-1.5 font-bold flex items-center gap-1 justify-end">
                      <Send className="w-3 h-3" />
                      {c.maxDailySends}/day
                    </div>
                  </div>
                </motion.div>
              )) : (
                <div className="text-center py-10 text-slate-400 italic font-medium flex flex-col items-center justify-center">
                  <Layers className="w-8 h-8 mb-3 opacity-20" />
                  No active campaigns at the moment.
                </div>
              )}
            </div>
          </Card>

          {/* Hot Leads */}
          <Card title="Hot Leads (Top Priority)" variant="premium" className="border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-200"></div>
                      <div className="space-y-2">
                        <div className="h-4 bg-slate-200 rounded w-24"></div>
                        <div className="h-3 bg-slate-200 rounded w-32"></div>
                      </div>
                    </div>
                  </div>
                ))
              ) : hotLeads.length > 0 ? hotLeads.map((l, i) => (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.005, backgroundColor: '#f8fafc' }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-700 transition-all">
                      {l.company ? l.company.charAt(0).toUpperCase() : l.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors text-base">{l.company || l.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <Users className="w-3 h-3 opacity-50" />
                        {l.name} <span className="text-slate-300">•</span> {l.title}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1.5">
                    <Badge variant={
                      l.outreachStatus === OutreachStatus.SENT ? 'info' : 
                      l.outreachStatus === OutreachStatus.PENDING ? 'warning' : 'gray'
                    }>
                      {l.outreachStatus}
                    </Badge>
                  </div>
                </motion.div>
              )) : (
                <div className="text-center py-10 text-slate-400 italic font-medium flex flex-col items-center justify-center">
                  <Star className="w-8 h-8 mb-3 opacity-20" />
                  No hot leads yet.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal Overlay */}
      <AnimatePresence>
        {selectedMetric && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setSelectedMetric(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  {selectedCampaignInModal && (
                    <button 
                      onClick={() => setSelectedCampaignInModal(null)}
                      className="mr-2 text-slate-400 hover:text-blue-600 transition-colors flex items-center justify-center p-1 rounded-full hover:bg-slate-100"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}
                  <Layers className="w-5 h-5 text-blue-500" />
                  {selectedMetric.title} 
                  {!selectedCampaignInModal && <span className="text-sm font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{selectedMetric.leads.length}</span>}
                </h2>
                <button
                  onClick={() => setSelectedMetric(null)}
                  className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-0 overflow-auto flex-1 flex flex-col bg-slate-50/30">
                {['high-intent', 'low-intent', 'sent', 'replies', 'interested', 'pending'].includes(selectedMetric.id) && !selectedCampaignInModal ? (
                  (() => {
                    const campaignIds = new Set(selectedMetric.leads.map(l => l.campaignId).filter(Boolean));
                    const relevantCampaigns = campaigns.filter(c => campaignIds.has(c.id));
                    const unassignedCount = selectedMetric.leads.filter(l => !l.campaignId).length;
                    
                    if (relevantCampaigns.length === 0 && unassignedCount === 0) {
                      return <div className="p-12 text-center text-slate-400 italic font-medium">No campaign data available for this metric.</div>
                    }

                    return (
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {relevantCampaigns.map((c, i) => {
                          const count = selectedMetric.leads.filter(l => l.campaignId === c.id).length;
                          return (
                            <motion.div
                              key={c.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.05 }}
                              whileHover={{ scale: 1.01, backgroundColor: '#f8fafc' }}
                              className="flex items-center justify-between p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-300 transition-all group cursor-pointer"
                              onClick={() => setSelectedCampaignInModal(c.id)}
                            >
                              <div className="relative z-10 flex-1">
                                <div className="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"></div>
                                  {c.name}
                                </div>
                                <div className="text-xs text-slate-500 mt-1 truncate max-w-[300px]">{c.description || 'No description'}</div>
                              </div>
                              <div className="text-right relative z-10">
                                <Badge variant="info">{count} Leads</Badge>
                              </div>
                            </motion.div>
                          );
                        })}
                        {unassignedCount > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              whileHover={{ scale: 1.01, backgroundColor: '#f8fafc' }}
                              className="flex items-center justify-between p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group cursor-pointer"
                              onClick={() => setSelectedCampaignInModal('unassigned')}
                            >
                              <div className="relative z-10 flex-1">
                                <div className="font-semibold text-slate-500 transition-colors flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                                  Unassigned Leads
                                </div>
                              </div>
                              <div className="text-right relative z-10">
                                <Badge variant="gray">{unassignedCount} Leads</Badge>
                              </div>
                            </motion.div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="relative">
                    <table className="w-full text-left border-collapse bg-white">
                      <thead className="bg-slate-50 border-b border-t border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Company Name</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Campaign</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Phone</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                        {(selectedMetric.title === 'Replies' || selectedMetric.title === 'Interested') && (
                          <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const leadsToRender = selectedCampaignInModal 
                          ? selectedMetric.leads.filter(l => selectedCampaignInModal === 'unassigned' ? !l.campaignId : l.campaignId === selectedCampaignInModal)
                          : selectedMetric.leads;

                        return leadsToRender.length > 0 ? leadsToRender.map(lead => (
                          <tr key={lead.id} className="hover:bg-slate-50 transition-colors cursor-default">
                            <td className="px-6 py-3 font-semibold text-slate-800">{lead.company}</td>
                            <td className="px-6 py-3 text-slate-600 text-xs font-medium max-w-[150px] truncate" title={campaigns.find(c => c.id === lead.campaignId)?.name || 'Unassigned'}>
                              {campaigns.find(c => c.id === lead.campaignId)?.name || <span className="text-slate-400 italic">Unassigned</span>}
                            </td>
                            <td className="px-6 py-3 text-slate-600 text-sm truncate max-w-[150px]" title={lead.phone}>{lead.phone || '--'}</td>
                            <td className="px-6 py-3 text-sm">
                              <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline truncate max-w-[150px] inline-block">{lead.email}</a>
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
                            {(selectedMetric.title === 'Replies' || selectedMetric.title === 'Interested') && (
                              <td className="px-6 py-3 text-right">
                                <a href={`https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(lead.email)}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1 group">
                                  Gmail <span className="text-[10px] group-hover:translate-x-0.5 transition-transform">&rarr;</span>
                                </a>
                              </td>
                            )}
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={(selectedMetric.title === 'Replies' || selectedMetric.title === 'Interested') ? 6 : 5} className="px-6 py-12 text-center text-slate-400 italic">
                              No leads found in this category.
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                    </table>
                    {selectedMetric.loading && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                        <span className="font-medium text-sm text-slate-500">Loading details...</span>
                      </div>
                    )}
                  </div>
              )}
            </div>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Dashboard;
