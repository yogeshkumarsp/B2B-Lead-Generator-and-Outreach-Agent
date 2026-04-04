import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/apiFetch';
import { store } from '../services/store';
import { Card, Input, Button } from './Common';
import { Save, Check, Loader2 } from 'lucide-react';

interface SettingsData {
  senderName: string;
  senderEmail: string;
  agentPersona: string;
  dailySendLimit: number;
  hourlyThrottleLimit: number;
  replyDetectionIntervalMinutes: number;
  isAgentEnabled: boolean;
}

const defaultSettings: SettingsData = {
  senderName: 'Yogesh Kumar',
  senderEmail: 'yogesh@autosdr.com',
  agentPersona: 'You are a senior SDR. Write concise, professional outreach emails.',
  dailySendLimit: 50,
  hourlyThrottleLimit: 10,
  replyDetectionIntervalMinutes: 30,
  isAgentEnabled: false,
};

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsData>({
    senderName: store.getSettings().senderName || defaultSettings.senderName,
    senderEmail: store.getSettings().senderEmail || defaultSettings.senderEmail,
    agentPersona: store.getSettings().agentPersona,
    dailySendLimit: store.getSettings().dailySendLimit,
    hourlyThrottleLimit: store.getSettings().hourlyThrottleLimit,
    replyDetectionIntervalMinutes: store.getSettings().replyDetectionIntervalMinutes,
    isAgentEnabled: store.getSettings().isAgentEnabled,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiFetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          const mapped = {
            senderName: data.senderName || defaultSettings.senderName,
            senderEmail: data.senderEmail || defaultSettings.senderEmail,
            agentPersona: data.agentPersona,
            dailySendLimit: data.dailySendLimit,
            hourlyThrottleLimit: data.hourlyThrottleLimit,
            replyDetectionIntervalMinutes: data.replyDetectionIntervalMinutes,
            isAgentEnabled: data.isAgentEnabled,
          };
          setSettings(mapped);
          store.updateSettings(mapped);
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2500);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">System Settings</h1>
        <p className="text-slate-500">Configure your agent persona and outreach limits. Settings are saved per account.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Agent Persona">
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Define how the AI agent identifies itself and the tone it should use in outreach emails.
            </p>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-lg h-48 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
              value={settings.agentPersona}
              onChange={(e) => setSettings({ ...settings, agentPersona: e.target.value })}
              placeholder="e.g. You are a senior SDR at a marketing agency..."
            />
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Sender Configuration">
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                These details will be used as the "From" address in your outreach emails.
              </p>
              <Input
                label="Sender Display Name"
                placeholder="e.g. Yogesh Kumar"
                value={settings.senderName}
                onChange={(e) => setSettings({ ...settings, senderName: e.target.value })}
              />
              <Input
                label="Sender Email Address"
                placeholder="e.g. yogesh@autosdr.com"
                value={settings.senderEmail}
                onChange={(e) => setSettings({ ...settings, senderEmail: e.target.value })}
              />
            </div>
          </Card>

          <Card title="Throttling & Limits">
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Daily Sending Limit"
                  type="number"
                  value={settings.dailySendLimit}
                  onChange={(e) => setSettings({ ...settings, dailySendLimit: parseInt(e.target.value) || 50 })}
                />
                <Input
                  label="Hourly Throttle (Emails/Hour)"
                  type="number"
                  value={settings.hourlyThrottleLimit}
                  onChange={(e) => setSettings({ ...settings, hourlyThrottleLimit: parseInt(e.target.value) || 10 })}
                />
                <Input
                  label="Reply Detection Interval (Min)"
                  type="number"
                  value={settings.replyDetectionIntervalMinutes}
                  onChange={(e) => setSettings({ ...settings, replyDetectionIntervalMinutes: parseInt(e.target.value) || 30 })}
                />
              </div>

              <div className="pt-4 border-t border-slate-100 pb-2">
                 <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-700">Autonomous SDR Agent</span>
                        <span className="text-xs text-slate-500 italic">When enabled, the agent will automatically trigger outreach for qualified leads.</span>
                    </div>
                    <div 
                      onClick={() => setSettings({ ...settings, isAgentEnabled: !settings.isAgentEnabled })}
                      className={`w-12 h-6 rounded-full relative transition-colors duration-300 cursor-pointer ${settings.isAgentEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${settings.isAgentEnabled ? 'left-7' : 'left-1'}`} />
                    </div>
                 </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-400 italic">
                  {isSaved ? '✓ Settings saved to your account!' : 'Careful: higher limits increase risk.'}
                </div>
                <Button onClick={handleSave} className="h-9">
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : isSaved ? (
                    <Check className="w-4 h-4 mr-2 text-emerald-500" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {isSaved ? 'Saved' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
