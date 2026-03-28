
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Leads from './components/Leads';
import Campaigns from './components/Campaigns';
import Logs from './components/Logs';
import Settings from './components/Settings';
import AdminPanel from './components/AdminPanel';
import LoginPage from './components/LoginPage';
import { store } from './services/store';
import { agent } from './services/agent';
import { authService } from './services/auth';

const App: React.FC = () => {
  const tabToUrl: Record<string, string> = {
    'dashboard': 'dashboard',
    'leads': 'leads',
    'campaigns': 'campaigns',
    'logs': 'agent-logs',
    'settings': 'settings',
    'admin': 'admin'
  };

  const urlToTab: Record<string, string> = Object.fromEntries(
    Object.entries(tabToUrl).map(([tab, url]) => [url, tab])
  );

  const getInitialTab = () => {
    const user = authService.getCurrentUser();
    const path = window.location.pathname.replace('/', '') || 'dashboard';
    const tab = urlToTab[path] || 'dashboard';
    
    // Redirect non-admins away from admin tab
    if (tab === 'admin' && user?.role !== 'ADMIN') {
      return 'dashboard';
    }
    return tab;
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [agentEnabled, setAgentEnabled] = useState(store.getSettings().isAgentEnabled);

  // Sync URL with activeTab
  useEffect(() => {
    const currentUrlPath = window.location.pathname.replace('/', '');
    const targetUrlPath = tabToUrl[activeTab];
    
    if (currentUrlPath !== targetUrlPath) {
      window.history.pushState({ tab: activeTab }, '', `/${targetUrlPath}`);
    }
  }, [activeTab]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoSuccess = params.get('sso_success');
    const token = params.get('token');
    const user = params.get('user');

    if (ssoSuccess === 'true' && token && user) {
      localStorage.setItem('token', token);
      localStorage.setItem('user', decodeURIComponent(user));
      setIsAuthenticated(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (agentEnabled) agent.start();

    const interval = setInterval(() => {
      setAgentEnabled(store.getSettings().isAgentEnabled);
    }, 1000);

    const handleStorageChange = () => {
      setIsAuthenticated(authService.isAuthenticated());
    };
    window.addEventListener('storage', handleStorageChange);

    const handleNav = (e: any) => {
      setActiveTab(e.detail);
    };
    window.addEventListener('app-navigate', handleNav as EventListener);

    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.tab) {
        setActiveTab(e.state.tab);
      } else {
        const path = window.location.pathname.replace('/', '') || 'dashboard';
        setActiveTab(urlToTab[path] || 'dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('app-navigate', handleNav as EventListener);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [agentEnabled]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'leads': return <Leads />;
      case 'campaigns': return <Campaigns />;
      case 'logs': return <Logs />;
      case 'settings': return <Settings />;
      case 'admin': return <AdminPanel />;
      default: return <Dashboard />;
    }
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      agentEnabled={agentEnabled}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;
