import React from 'react';
import { LayoutDashboard, Users, Layers, Terminal, Settings, Play, Pause, Bot, Circle, ShieldCheck } from 'lucide-react';
import { authService } from '../services/auth';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  agentEnabled: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, agentEnabled }) => {
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'leads', icon: Users, label: 'Leads' },
    { id: 'campaigns', icon: Layers, label: 'Campaigns' },
    { id: 'logs', icon: Terminal, label: 'Agent Logs' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const toggleAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !agentEnabled;
    const { store } = require('../services/store');
    const { agent } = require('../services/agent');
    store.updateSettings({ isAgentEnabled: newState });
    if (newState) agent.start();
    else agent.stop();
  };

  const user = authService.getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-transparent font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col h-auto md:h-screen sticky top-0 shadow-sm z-50">
        {/* Logo */}
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <Bot className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">AutoSDR</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {menuItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === item.id
                  ? 'bg-blue-50/80 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}

          {/* Admin nav item — always visible */}
          <div className="pt-3 pb-1 px-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Admin</div>
          </div>
          <button
            onClick={() => onTabChange('admin')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'admin'
                ? 'bg-blue-50/80 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Access Requests
          </button>
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-slate-100 flex flex-col gap-4">
          {/* User Profile */}
          {user && (
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-slate-50">
                {user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate">{user.name || 'User'}</div>
                <div className="text-[11px] font-medium text-slate-400 truncate">{user.email}</div>
              </div>
            </div>
          )}

          {/* Agent Status */}
          <div
            onClick={toggleAgent}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-sm relative group cursor-pointer hover:border-blue-300 hover:shadow-md transition-all active:scale-[0.98]"
          >
            <div className={`absolute top-4 right-4 ${agentEnabled ? 'text-emerald-500' : 'text-slate-300'}`}>
              <Circle className={`w-2 h-2 fill-current ${agentEnabled ? 'animate-pulse' : ''}`} />
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Agent Status</div>
            <div className="text-sm font-semibold text-slate-800 flex items-center justify-between gap-2">
              <span>{agentEnabled ? 'Running Active' : 'System Paused'}</span>
              {agentEnabled
                ? <Pause className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                : <Play className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              }
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={() => authService.logout()}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all border border-transparent hover:border-red-100 group"
          >
            <Pause className="w-4 h-4 rotate-90" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 lg:p-12 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
};

export default Layout;
