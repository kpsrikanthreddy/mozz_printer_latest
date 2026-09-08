import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Clock,
  History,
  Printer,
  Settings,
  Flame,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Header } from './components/Header.js';
import { DashboardTab } from './components/DashboardTab.js';
import { JobsTab } from './components/JobsTab.js';
import { HistoryTab } from './components/HistoryTab.js';
import { PrintersTab } from './components/PrintersTab.js';
import { SettingsTab } from './components/SettingsTab.js';
import { DeviceAuthModal } from './components/DeviceAuthModal.js';
import { TestPrintModal } from './components/TestPrintModal.js';
import type {
  AppSettings,
  AgentConnectionStatus,
  AgentMetrics,
  PrinterConfig,
  DiscoveredPrinter,
  PrintJob,
  PrinterStation,
  PaperWidthMm,
  PrintJobType,
} from '@/types/index.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'jobs' | 'history' | 'printers' | 'settings'>('dashboard');
  const [status, setStatus] = useState<AgentConnectionStatus>('disconnected');
  const [settings, setSettings] = useState<AppSettings>({
    apiUrl: 'http://localhost:3000',
    restaurantId: '',
    branchId: '',
    restaurantName: 'Starters4U',
    branchName: 'Madhapur Outlet',
    deviceId: 'win-pos-01',
    deviceName: 'Cash Counter POS',
    isRegistered: false,
    autoStartOnBoot: false,
    minimizeToTray: true,
    mockPrintersEnabled: false,
  });

  const [metrics, setMetrics] = useState<AgentMetrics>({
    totalJobsReceived: 0,
    totalJobsPrinted: 0,
    totalJobsFailed: 0,
    pendingQueueLength: 0,
    connectionUptimeSeconds: 0,
  });

  const [pendingJobs, setPendingJobs] = useState<PrintJob[]>([]);
  const [failedJobs, setFailedJobs] = useState<PrintJob[]>([]);
  const [historyJobs, setHistoryJobs] = useState<PrintJob[]>([]);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([]);
  const [printerConfigs, setPrinterConfigs] = useState<PrinterConfig[]>([]);
  const [appVersion, setAppVersion] = useState<string>('1.0.0');

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  // Global Notification state
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [notification]);

  const isBrowserPreview =
    typeof window !== 'undefined' &&
    (!window.mozzPrinterAPI?.isElectron || !!window.mozzPrinterAPI?.isBrowserPreview);

  // Initial Load & IPC setup
  useEffect(() => {
    if (!window.mozzPrinterAPI) {
      console.warn('mozzPrinterAPI not detected, running in browser preview mode');
      return;
    }

    const loadAll = async () => {
      try {
        const [
          initialSettings,
          initialStatus,
          initialMetrics,
          pending,
          failed,
          history,
          printers,
          configs,
          ver,
        ] = await Promise.all([
          window.mozzPrinterAPI.getSettings(),
          window.mozzPrinterAPI.getConnectionStatus(),
          window.mozzPrinterAPI.getMetrics(),
          window.mozzPrinterAPI.getPendingJobs(),
          window.mozzPrinterAPI.getFailedJobs(),
          window.mozzPrinterAPI.getJobHistory(100),
          window.mozzPrinterAPI.getAvailablePrinters(),
          window.mozzPrinterAPI.getPrinterConfigs(),
          window.mozzPrinterAPI.getAppVersion(),
        ]);

        setSettings(initialSettings);
        setStatus(initialStatus);
        setMetrics(initialMetrics);
        setPendingJobs(pending);
        setFailedJobs(failed);
        setHistoryJobs(history);
        setDiscoveredPrinters(printers);
        setPrinterConfigs(configs);
        setAppVersion(ver);

        // Open device pairing modal if not yet linked
        if (!initialSettings.isRegistered) {
          setIsAuthModalOpen(true);
        }
      } catch (err) {
        console.error('Failed initializing desktop state:', err);
      }
    };

    loadAll();

    // Listen to real-time events from Main process
    const unsubStatus = window.mozzPrinterAPI.onConnectionStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    const unsubJobs = window.mozzPrinterAPI.onJobEvent(() => {
      // Refresh queues on incoming or updated print jobs
      refreshQueues();
    });

    // Periodic metrics poller
    const metricsInterval = setInterval(async () => {
      if (window.mozzPrinterAPI) {
        try {
          const m = await window.mozzPrinterAPI.getMetrics();
          setMetrics(m);
        } catch {
          // ignore
        }
      }
    }, 4000);

    return () => {
      unsubStatus();
      unsubJobs();
      clearInterval(metricsInterval);
    };
  }, []);

  const refreshQueues = async () => {
    if (!window.mozzPrinterAPI) return;
    try {
      const [pending, failed, history, m] = await Promise.all([
        window.mozzPrinterAPI.getPendingJobs(),
        window.mozzPrinterAPI.getFailedJobs(),
        window.mozzPrinterAPI.getJobHistory(100),
        window.mozzPrinterAPI.getMetrics(),
      ]);
      setPendingJobs(pending);
      setFailedJobs(failed);
      setHistoryJobs(history);
      setMetrics(m);
    } catch {
      // ignore
    }
  };

  const handleRetryJob = async (jobId: string) => {
    if (!window.mozzPrinterAPI) return;
    await window.mozzPrinterAPI.retryJob(jobId);
    await refreshQueues();
  };

  const handleReprintJob = async (jobId: string) => {
    if (!window.mozzPrinterAPI) return;
    await window.mozzPrinterAPI.reprintJob(jobId);
    await refreshQueues();
  };

  const handleClearCompleted = async () => {
    if (!window.mozzPrinterAPI) return;
    await window.mozzPrinterAPI.clearCompletedJobs();
    await refreshQueues();
  };

  const handleSavePrinterConfig = async (config: PrinterConfig) => {
    if (!window.mozzPrinterAPI) return;
    await window.mozzPrinterAPI.savePrinterConfig(config);
    const updated = await window.mozzPrinterAPI.getPrinterConfigs();
    setPrinterConfigs(updated);
  };

  const handleSaveSettings = async (updates: Partial<AppSettings>) => {
    if (!window.mozzPrinterAPI) return;
    const updated = await window.mozzPrinterAPI.saveSettings(updates);
    setSettings(updated);
  };

  const handleRegisterDevice = async (payload: {
    apiUrl: string;
    restaurantId: string;
    branchId: string;
    deviceId: string;
    deviceName: string;
  }) => {
    if (!window.mozzPrinterAPI) return { success: false, error: 'API unavailable' };
    const res = await window.mozzPrinterAPI.registerDevice(payload);
    if (res.success) {
      const updated = await window.mozzPrinterAPI.getSettings();
      setSettings(updated);
      const st = await window.mozzPrinterAPI.getConnectionStatus();
      setStatus(st);
    }
    return res;
  };

  const handlePairWithCode = async (payload: {
    apiUrl: string;
    pairingCode: string;
    deviceName?: string;
  }) => {
    if (!window.mozzPrinterAPI) return { success: false, error: 'API unavailable' };
    const res = await window.mozzPrinterAPI.pairDeviceWithCode(payload);
    if (res.success) {
      const updated = await window.mozzPrinterAPI.getSettings();
      setSettings(updated);
      const st = await window.mozzPrinterAPI.getConnectionStatus();
      setStatus(st);
    }
    return res;
  };

  const handleDisconnect = async () => {
    if (!window.mozzPrinterAPI) return;
    await window.mozzPrinterAPI.disconnectDevice();
    const updated = await window.mozzPrinterAPI.getSettings();
    setSettings(updated);
    setStatus('unauthorized');
    setIsAuthModalOpen(true);
  };

  const handleTriggerTestPrint = async (payload: {
    type: PrintJobType;
    station: PrinterStation;
    paperWidthMm: PaperWidthMm;
    customPrinterName?: string;
  }) => {
    if (!window.mozzPrinterAPI) {
      const err = 'Desktop printer API unavailable';
      setNotification({
        type: 'error',
        title: 'Test Print Failed',
        message: err,
      });
      return { success: false, error: err };
    }

    const res = await window.mozzPrinterAPI.testPrint(payload);
    await refreshQueues();

    if (res.success) {
      setNotification({
        type: 'success',
        title: 'Test Print Succeeded',
        message: `Print job spooled to "${payload.customPrinterName || payload.station}". Spool verified.`,
      });
    } else {
      setNotification({
        type: 'error',
        title: 'Test Print Failed',
        message: res.error || 'Check printer connection and drivers.',
      });
    }

    return res;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        status={status}
        settings={settings}
        onOpenRegister={() => setIsAuthModalOpen(true)}
        onOpenTestPrint={() => setIsTestModalOpen(true)}
        onSimulateOrder={() => {
          (window as any).mozzPrinterSimulateOrder?.();
        }}
      />

      {/* Main Content Layout (Sidebar + Stage) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-56 border-r border-slate-800 bg-slate-900/60 p-3 flex flex-col justify-between select-none">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('jobs')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'jobs'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Clock className="w-4 h-4" />
                <span>Queue & Errors</span>
              </div>
              {failedJobs.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                  {failedJobs.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'history'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <History className="w-4 h-4" />
              <span>History</span>
            </button>

            <button
              onClick={() => setActiveTab('printers')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'printers'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Station Drivers</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'settings'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Bottom Card */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs">
            <div className="flex items-center space-x-2 text-orange-400 font-bold mb-1">
              <Flame className="w-4 h-4" />
              <span>Starters4U</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Korean Pocket Pizzas & Gourmet Burgers POS Spooler.
            </p>
          </div>
        </aside>

        {/* Viewport Content Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
          {/* Browser Preview Notification Banner */}
          {isBrowserPreview && (
            <div
              id="global-browser-preview-notice"
              className="mb-5 px-4 py-3 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-200 flex items-center justify-between text-xs shadow-md"
            >
              <div className="flex items-center space-x-3">
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-amber-300">
                    Browser preview—physical printing unavailable
                  </span>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    Physical printing is disabled in the web browser preview and only functions inside the packaged Electron desktop application. Mock thermal spooling is enabled for virtual test drills.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold uppercase tracking-wider shrink-0">
                Web Preview
              </span>
            </div>
          )}
          {activeTab === 'dashboard' && (
            <DashboardTab
              metrics={metrics}
              recentJobs={historyJobs}
              status={status}
              settings={settings}
              printerConfigs={printerConfigs}
              onNavigateTab={(tab) => setActiveTab(tab as any)}
              onOpenTestPrint={() => setIsTestModalOpen(true)}
              onRetryJob={handleRetryJob}
            />
          )}

          {activeTab === 'jobs' && (
            <JobsTab
              pendingJobs={pendingJobs}
              failedJobs={failedJobs}
              onRetryJob={handleRetryJob}
              onReprintJob={handleReprintJob}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab
              historyJobs={historyJobs}
              onReprintJob={handleReprintJob}
              onClearCompleted={handleClearCompleted}
            />
          )}

          {activeTab === 'printers' && (
            <PrintersTab
              discoveredPrinters={discoveredPrinters}
              printerConfigs={printerConfigs}
              onRefreshPrinters={async () => {
                if (window.mozzPrinterAPI) {
                  const p = await window.mozzPrinterAPI.getAvailablePrinters();
                  setDiscoveredPrinters(p);
                }
              }}
              onSaveConfig={handleSavePrinterConfig}
              onTestPrint={async (st, width, pName) => {
                await handleTriggerTestPrint({
                  type: st === 'billing' ? 'BILL' : 'KOT',
                  station: st,
                  paperWidthMm: width,
                  customPrinterName: pName,
                });
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              settings={settings}
              appVersion={appVersion}
              onSaveSettings={handleSaveSettings}
              onOpenRegister={() => setIsAuthModalOpen(true)}
              onDisconnect={handleDisconnect}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <DeviceAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        settings={settings}
        onPairWithCode={handlePairWithCode}
        onRegister={handleRegisterDevice}
      />

      <TestPrintModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        printerConfigs={printerConfigs}
        discoveredPrinters={discoveredPrinters}
        onTriggerTestPrint={handleTriggerTestPrint}
      />

      {/* Visible Success / Error Notification Toast */}
      {notification && (
        <div
          id="toast-notification"
          className={`fixed bottom-6 right-6 z-50 max-w-md p-4 rounded-xl border shadow-2xl flex items-start space-x-3 transition-all animate-in fade-in slide-in-from-bottom-4 ${
            notification.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
              : 'bg-rose-950/95 border-rose-500/60 text-rose-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 pr-2">
            <h5 className="text-xs font-bold">{notification.title}</h5>
            <p className="text-[11px] mt-0.5 leading-relaxed opacity-90">{notification.message}</p>
          </div>
          <button
            id="btn-dismiss-toast"
            onClick={() => setNotification(null)}
            className="p-1 rounded text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
