import React, { useState } from 'react';
import {
  Save,
  Check,
  Server,
  Monitor,
  Shield,
  Sliders,
  ExternalLink,
  LogOut,
  Power,
} from 'lucide-react';
import type { AppSettings } from '@/types/index.js';

interface SettingsTabProps {
  settings: AppSettings;
  appVersion: string;
  onSaveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  onOpenRegister: () => void;
  onDisconnect: () => Promise<void>;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  appVersion,
  onSaveSettings,
  onOpenRegister,
  onDisconnect,
}) => {
  const [formData, setFormData] = useState({
    apiUrl: settings.apiUrl || '',
    autoStartOnBoot: !!settings.autoStartOnBoot,
    minimizeToTray: !!settings.minimizeToTray,
    mockPrintersEnabled: !!settings.mockPrintersEnabled,
  });

  const [isSaved, setIsSaved] = useState(false);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [urlPingResult, setUrlPingResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleToggle = (field: 'autoStartOnBoot' | 'minimizeToTray' | 'mockPrintersEnabled') => {
    setFormData((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleTestBackend = async () => {
    if (!formData.apiUrl) return;
    setIsTestingUrl(true);
    setUrlPingResult(null);

    try {
      const cleanUrl = formData.apiUrl.replace(/\/$/, '');
      const res = await fetch(`${cleanUrl}/api/health`, { method: 'GET' });
      if (res.ok) {
        setUrlPingResult({ ok: true, msg: 'Connected successfully to Starters4U backend.' });
      } else {
        setUrlPingResult({ ok: false, msg: `Server responded with HTTP status ${res.status}.` });
      }
    } catch (err: any) {
      setUrlPingResult({ ok: false, msg: err.message || 'Unable to reach backend URL.' });
    } finally {
      setIsTestingUrl(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">Agent Configuration</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage Starters4U backend endpoint, Windows system integration, and printer modes.
        </p>
      </div>

      {/* Backend API Section */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm">
        <div className="flex items-center space-x-2.5">
          <Server className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-bold text-slate-200">Backend Server Connection</h3>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-400">
              Starters4U Server API Base URL
            </label>
            <div className="flex items-center space-x-2 text-[11px]">
              <span className="text-slate-500">Quick Fill:</span>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, apiUrl: 'https://www.starters4u.in' }))}
                className="text-orange-400 hover:text-orange-300 underline font-mono"
              >
                Production (starters4u.in)
              </button>
              <span className="text-slate-600">•</span>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, apiUrl: 'http://localhost:3000' }))}
                className="text-slate-400 hover:text-slate-300 underline font-mono"
              >
                Local Dev (:3000)
              </button>
            </div>
          </div>
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="e.g. https://www.starters4u.in or http://localhost:3000"
              value={formData.apiUrl}
              onChange={(e) => setFormData((prev) => ({ ...prev, apiUrl: e.target.value }))}
              className="flex-1 px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-orange-500 font-mono"
            />
            <button
              type="button"
              onClick={handleTestBackend}
              disabled={isTestingUrl || !formData.apiUrl}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {isTestingUrl ? 'Pinging...' : 'Test Connection'}
            </button>
          </div>

          {urlPingResult && (
            <p
              className={`text-xs mt-1.5 font-medium ${
                urlPingResult.ok ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {urlPingResult.msg}
            </p>
          )}

          <p className="text-[11px] text-slate-500">
            Standardized production backend is <code className="text-slate-400 font-mono">https://www.starters4u.in</code> (configured via <code className="text-slate-400 font-mono">MOZZ_API_URL</code>). Local port <code className="text-slate-400 font-mono">http://localhost:3000</code> is reserved for development. Device authentication tokens are secured via OS-level encryption and never exposed in renderer variables.
          </p>
        </div>
      </div>

      {/* Linked Restaurant & Branch Info */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">Device Link & Authentication</h3>
          </div>
          <button
            type="button"
            onClick={onOpenRegister}
            className="text-xs text-orange-400 hover:text-orange-300 font-semibold"
          >
            Switch Outlet / Re-link →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold">Outlet Name</span>
            <p className="font-semibold text-slate-200 mt-0.5">
              {settings.restaurantName || 'Starters4U'} - {settings.branchName || 'Main Outlet'}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold">Terminal ID</span>
            <p className="font-mono text-slate-200 mt-0.5">{settings.deviceId || 'pos-win-01'}</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-400">
            Token Status: <strong className="text-emerald-400">Authenticated & Secure</strong> (Stored in Windows AppData)
          </span>
          <button
            type="button"
            onClick={onDisconnect}
            className="flex items-center space-x-1.5 text-xs text-rose-400 hover:text-rose-300 font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Unlink Device</span>
          </button>
        </div>
      </div>

      {/* Windows Integration & Behavior */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm">
        <div className="flex items-center space-x-2.5">
          <Sliders className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-slate-200">Windows System Integration</h3>
        </div>

        <div className="space-y-3.5">
          {/* Auto Start */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Start with Windows Boot</p>
              <p className="text-[11px] text-slate-400">
                Launches Mozz Print Agent automatically when the POS terminal starts up.
              </p>
            </div>
            <input
              type="checkbox"
              checked={formData.autoStartOnBoot}
              onChange={() => handleToggle('autoStartOnBoot')}
              className="w-4 h-4 rounded text-orange-600 bg-slate-950 border-slate-800 focus:ring-0 cursor-pointer"
            />
          </div>

          {/* Minimize to Tray */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
            <div>
              <p className="text-xs font-semibold text-slate-200">Minimize to System Tray</p>
              <p className="text-[11px] text-slate-400">
                Closing the window hides the app to the Windows taskbar tray to keep spooling active.
              </p>
            </div>
            <input
              type="checkbox"
              checked={formData.minimizeToTray}
              onChange={() => handleToggle('minimizeToTray')}
              className="w-4 h-4 rounded text-orange-600 bg-slate-950 border-slate-800 focus:ring-0 cursor-pointer"
            />
          </div>

          {/* Mock Mode */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
            <div>
              <p className="text-xs font-semibold text-slate-200">Virtual Mock Printer Mode</p>
              <p className="text-[11px] text-slate-400">
                Simulates real thermal printing in memory without sending jobs to physical drivers.
              </p>
            </div>
            <input
              type="checkbox"
              checked={formData.mockPrintersEnabled}
              onChange={() => handleToggle('mockPrintersEnabled')}
              className="w-4 h-4 rounded text-orange-600 bg-slate-950 border-slate-800 focus:ring-0 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Footer Save Button */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-[11px] text-slate-500">
          Agent Version: v{appVersion} • Windows 64-bit Architecture
        </div>

        <button
          type="submit"
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
            isSaved
              ? 'bg-emerald-600 text-white'
              : 'bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-600/20'
          }`}
        >
          {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{isSaved ? 'Settings Saved' : 'Save Changes'}</span>
        </button>
      </div>
    </form>
  );
};
