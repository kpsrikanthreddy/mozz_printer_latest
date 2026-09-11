import type {
  AppSettings,
  AgentConnectionStatus,
  AgentMetrics,
  PrinterConfig,
  DiscoveredPrinter,
  PrintJob,
  PrintJobType,
  PrinterStation,
  PaperWidthMm,
  MozzPrinterAPI,
  KotTicketPayload,
  BillTicketPayload,
} from '../../types/index.js';

const STORAGE_KEY = 'mozz_printer_browser_store_v2';

interface BrowserStoreData {
  settings: AppSettings;
  printers: DiscoveredPrinter[];
  printerConfigs: PrinterConfig[];
  jobs: PrintJob[];
  status: AgentConnectionStatus;
  startedAt: number;
}

const DEFAULT_PRINTERS: DiscoveredPrinter[] = [
  {
    name: 'EPSON_TM_T82III_Kitchen',
    displayName: 'Epson TM-T82III (Kitchen Master 80mm)',
    description: 'High-speed auto-cutter thermal printer for hot kitchen orders',
    isDefault: false,
    isOnline: true,
  },
  {
    name: 'TVS_RP3200_Star_Billing',
    displayName: 'TVS RP 3200 Plus (Billing Counter 80mm)',
    description: 'USB/Ethernet fast billing receipt printer with 260mm/sec speed',
    isDefault: true,
    isOnline: true,
  },
  {
    name: 'POS_58MM_Pizza_Station',
    displayName: 'POS-58 Thermal (Pizza Counter 58mm)',
    description: 'Compact 58mm thermal receipt printer for pizza prep station',
    isDefault: false,
    isOnline: true,
  },
  {
    name: 'XPRINTER_XP58_Bar',
    displayName: 'Xprinter XP-58 (Chinese Special 58mm)',
    description: 'Serial/USB thermal ticket printer for Chinese dishes, noodles, and wok section',
    isDefault: false,
    isOnline: true,
  },
  {
    name: 'MOCK_PRINTER',
    displayName: 'Mock Virtual Thermal Spooler',
    description: 'In-memory virtual driver for offline verification and testing',
    isDefault: false,
    isOnline: true,
  },
  {
    name: 'Canon G3010 series',
    displayName: 'Canon G3010 series',
    description: 'Canon G3010 Series Windows Driver for A4 Diagnostic Test Printing',
    isDefault: false,
    isOnline: true,
  },
  {
    name: 'Microsoft_Print_to_PDF',
    displayName: 'Microsoft Print to PDF',
    description: 'System software print device for document verification',
    isDefault: false,
    isOnline: true,
  },
];

const DEFAULT_CONFIGS: PrinterConfig[] = [
  {
    station: 'kitchen_master',
    printerName: 'EPSON_TM_T82III_Kitchen',
    paperWidthMm: 80,
    copies: 1,
    isAutoPrint: true,
  },
  {
    station: 'billing',
    printerName: 'TVS_RP3200_Star_Billing',
    paperWidthMm: 80,
    copies: 2,
    isAutoPrint: true,
  },
  {
    station: 'kitchen_pizza',
    printerName: 'POS_58MM_Pizza_Station',
    paperWidthMm: 58,
    copies: 1,
    isAutoPrint: true,
  },
  {
    station: 'bar_beverage',
    printerName: 'XPRINTER_XP58_Bar',
    paperWidthMm: 58,
    copies: 1,
    isAutoPrint: true,
  },
];

const isDev = Boolean(
  (import.meta as any)?.env?.DEV ||
    (typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
);
export const PRODUCTION_DEFAULT_API_URL = 'https://www.starters4u.in';
export const DEV_DEFAULT_API_URL = 'http://localhost:3000';
export const STANDARDIZED_DEFAULT_API_URL = isDev ? DEV_DEFAULT_API_URL : PRODUCTION_DEFAULT_API_URL;

const DEFAULT_SETTINGS: AppSettings = {
  apiUrl: STANDARDIZED_DEFAULT_API_URL,
  restaurantId: 'rest_starters4u_01',
  branchId: 'branch_madhapur_01',
  restaurantName: 'Starters4U',
  branchName: 'Madhapur Outlet',
  deviceId: 'win-pos-01',
  deviceName: 'Cash Counter POS',
  isRegistered: true,
  autoStartOnBoot: true,
  minimizeToTray: true,
  mockPrintersEnabled: true,
  hasToken: true,
  maskedToken: 'ptk_win_••••••••••••8841',
  lastHeartbeatAt: new Date().toISOString(),
};

// No simulated orders or demo data in production builds
const INITIAL_JOBS: PrintJob[] = [];

class BrowserPrintAgentStore {
  private data: BrowserStoreData;
  private statusListeners = new Set<(status: AgentConnectionStatus) => void>();
  private jobListeners = new Set<(event: { type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED'; job: PrintJob }) => void>();

  constructor() {
    this.data = this.load();
  }

  private load(): BrowserStoreData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.settings) {
          return {
            ...parsed,
            jobs: [], // Strictly empty in browser preview mode
            startedAt: parsed.startedAt || Date.now(),
            status: 'connected_sse',
          };
        }
      }
    } catch {
      // ignore
    }

    const initial: BrowserStoreData = {
      settings: DEFAULT_SETTINGS,
      printers: DEFAULT_PRINTERS,
      printerConfigs: DEFAULT_CONFIGS,
      jobs: INITIAL_JOBS,
      status: 'connected_sse',
      startedAt: Date.now() - 1000 * 60 * 32,
    };
    this.save(initial);
    return initial;
  }

  private save(data: BrowserStoreData): void {
    try {
      // Guarantee zero stored jobs in browser preview
      const cleanData = { ...data, jobs: [] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanData));
    } catch {
      // ignore
    }
  }

  getSettings(): AppSettings {
    return {
      ...this.data.settings,
      lastHeartbeatAt: new Date().toISOString(),
    };
  }

  saveSettings(updates: Partial<AppSettings>): AppSettings {
    const cleanUpdates = { ...updates };
    delete (cleanUpdates as any).deviceToken;
    delete (cleanUpdates as any).token;

    if (typeof cleanUpdates.apiUrl === 'string') {
      cleanUpdates.apiUrl = cleanUpdates.apiUrl.trim().replace(/\/+$/, '');
    }

    this.data.settings = {
      ...this.data.settings,
      ...cleanUpdates,
      lastHeartbeatAt: new Date().toISOString(),
    };
    if (this.data.settings.isRegistered && this.data.status !== 'connected_sse') {
      this.setStatus('connected_sse');
    }
    this.save(this.data);
    return this.data.settings;
  }

  getStatus(): AgentConnectionStatus {
    return this.data.status;
  }

  setStatus(st: AgentConnectionStatus): void {
    this.data.status = st;
    this.save(this.data);
    for (const listener of this.statusListeners) {
      try {
        listener(st);
      } catch (err) {
        console.error(err);
      }
    }
  }

  getMetrics(): AgentMetrics {
    return {
      totalJobsReceived: 0,
      totalJobsPrinted: 0,
      totalJobsFailed: 0,
      pendingQueueLength: 0,
      connectionUptimeSeconds: 0,
      lastSyncTime: 'N/A (Preview Mode)',
    };
  }

  getAvailablePrinters(): DiscoveredPrinter[] {
    return this.data.printers;
  }

  getPrinterConfigs(): PrinterConfig[] {
    return this.data.printerConfigs;
  }

  savePrinterConfig(config: PrinterConfig): { success: boolean } {
    const idx = this.data.printerConfigs.findIndex((c) => c.station === config.station);
    if (idx >= 0) {
      this.data.printerConfigs[idx] = { ...config };
    } else {
      this.data.printerConfigs.push({ ...config });
    }
    this.save(this.data);
    return { success: true };
  }

  getPendingJobs(): PrintJob[] {
    return [];
  }

  getFailedJobs(): PrintJob[] {
    return [];
  }

  getJobHistory(_limit = 100): PrintJob[] {
    return [];
  }

  subscribeStatus(cb: (status: AgentConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  subscribeJobs(cb: (event: { type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED'; job: PrintJob }) => void): () => void {
    this.jobListeners.add(cb);
    return () => this.jobListeners.delete(cb);
  }

  private dispatchJobEvent(type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED', job: PrintJob) {
    for (const listener of this.jobListeners) {
      try {
        listener({ type, job });
      } catch (err) {
        console.error(err);
      }
    }
  }

  async pairDeviceWithCode(_payload: {
    apiUrl: string;
    pairingCode: string;
    deviceId?: string;
    deviceName?: string;
  }): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    return {
      success: false,
      error: 'Preview mode — pairing is disabled. Available only in the installed Windows Print Agent.',
    };
  }

  async registerDevice(_payload: {
    apiUrl: string;
    restaurantId: string;
    branchId: string;
    deviceId: string;
    deviceName: string;
  }): Promise<{ success: boolean; deviceName: string; error?: string }> {
    return {
      success: false,
      deviceName: '',
      error: 'Preview mode — pairing is disabled. Available only in the installed Windows Print Agent.',
    };
  }

  async disconnectDevice(): Promise<{ success: boolean }> {
    return { success: false };
  }

  async testPrint(_payload: {
    type: PrintJobType;
    station: PrinterStation;
    paperWidthMm: PaperWidthMm;
    customPrinterName?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: 'Preview mode — printing, pairing, backend connection, SSE, and test actions are disabled. Available only in the installed Windows Print Agent.',
    };
  }

  async retryJob(_jobId: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Preview mode — printing is disabled' };
  }

  async reprintJob(_jobId: string, _station?: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Preview mode — printing is disabled' };
  }

  clearCompletedJobs(): { count: number } {
    return { count: 0 };
  }

  deleteJob(_jobId: string): { success: boolean } {
    return { success: false };
  }

  deleteJobs(_jobIds: string[]): { count: number; success: boolean } {
    return { count: 0, success: true };
  }

  cancelJob(_jobId: string, _reason = 'Cancelled by operator'): { success: boolean } {
    return { success: false };
  }
}

let storeInstance: BrowserPrintAgentStore | null = null;

export function initBrowserApi(): MozzPrinterAPI {
  if (typeof window === 'undefined') {
    return {} as any;
  }

  if (window.mozzPrinterAPI) {
    return window.mozzPrinterAPI;
  }

  if (!storeInstance) {
    storeInstance = new BrowserPrintAgentStore();
  }
  const store = storeInstance;

  const api: MozzPrinterAPI = {
    // Settings & Status
    getSettings: async () => store.getSettings(),
    saveSettings: async (settings) => store.saveSettings(settings),
    getConnectionStatus: async () => store.getStatus(),
    getMetrics: async () => store.getMetrics(),
    onConnectionStatusChange: (callback) => store.subscribeStatus(callback),
    onJobEvent: (callback) => store.subscribeJobs(callback),

    // Device Auth & Onboarding
    pairDeviceWithCode: async (payload) => store.pairDeviceWithCode(payload),
    registerDevice: async (payload) => store.registerDevice(payload),
    disconnectDevice: async () => store.disconnectDevice(),

    // Hardware & Printers
    getAvailablePrinters: async () => store.getAvailablePrinters(),
    getPrinterConfigs: async () => store.getPrinterConfigs(),
    savePrinterConfig: async (config) => store.savePrinterConfig(config),
    testPrint: async (payload) => store.testPrint(payload),

    // Print Queue & History
    getPendingJobs: async () => store.getPendingJobs(),
    getFailedJobs: async () => store.getFailedJobs(),
    getJobHistory: async (limit) => store.getJobHistory(limit),
    retryJob: async (jobId) => store.retryJob(jobId),
    reprintJob: async (jobId, station) => store.reprintJob(jobId, station),
    clearCompletedJobs: async () => store.clearCompletedJobs(),
    deleteJob: async (jobId) => store.deleteJob(jobId),
    deleteJobs: async (jobIds) => store.deleteJobs(jobIds),
    cancelJob: async (jobId, reason) => store.cancelJob(jobId, reason),

    // Window Controls
    openExternal: async (url) => {
      window.open(url, '_blank');
    },
    minimizeWindow: () => {
      console.log('[Browser Print Agent] Window minimize simulated');
    },
    closeWindow: () => {
      console.log('[Browser Print Agent] Window close simulated');
    },
    getAppVersion: async () => '1.0.0',

    isElectron: false,
    isBrowserPreview: true,
  };

  window.mozzPrinterAPI = api;

  return api;
}
