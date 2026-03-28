
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/apiFetch';
import { Card } from './Common';
import { AgentLog, LogLevel, LogModule } from '../types';
import { Search, Star, Layers, Send, Reply, Download, Bot, Info } from 'lucide-react';

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<AgentLog[]>([]);

  const fetchLogs = async () => {
    try {
      const res = await apiFetch('/api/logs');
      if (res.ok) setLogs(await res.json());
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case LogLevel.ACTION: return 'text-blue-600';
      case LogLevel.WARNING: return 'text-amber-600';
      case LogLevel.ERROR: return 'text-red-600';
      default: return 'text-slate-500';
    }
  };

  const getModuleIcon = (module: LogModule) => {
    switch (module) {
      case LogModule.DISCOVERY: return <Search className="w-4 h-4 text-slate-400" />;
      case LogModule.SCORING: return <Star className="w-4 h-4 text-slate-400" />;
      case LogModule.CAMPAIGN: return <Layers className="w-4 h-4 text-slate-400" />;
      case LogModule.OUTREACH: return <Send className="w-4 h-4 text-slate-400" />;
      case LogModule.FOLLOWUP: return <Reply className="w-4 h-4 text-slate-400" />;
      case LogModule.EXPORT: return <Download className="w-4 h-4 text-slate-400" />;
      case LogModule.AGENT: return <Bot className="w-4 h-4 text-slate-400" />;
      default: return <Info className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Agent Logs</h1>
        <p className="text-slate-500">Structured audit trail of all autonomous activities.</p>
      </header>

      <Card className="!p-0 overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto font-mono text-sm">
          {logs.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {logs.map(log => (
                <div key={log.id} className="p-4 hover:bg-slate-50 flex items-start gap-4 transition-colors">
                  <div className="text-[10px] text-slate-400 whitespace-nowrap pt-1">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                  <div className={`w-24 text-[10px] font-bold uppercase pt-1 tracking-tight ${getLevelColor(log.level)}`}>
                    {log.level}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      {getModuleIcon(log.module)}
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{log.module}</span>
                      {log.leadId && (
                        <span className="text-[10px] bg-slate-100 px-1 rounded text-slate-500">ID: {log.leadId}</span>
                      )}
                    </div>
                    <div className="text-slate-700 leading-relaxed">{log.message}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 italic">
              No logs available yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Logs;
