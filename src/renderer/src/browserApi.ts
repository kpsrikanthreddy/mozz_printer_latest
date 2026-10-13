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
const TOKEN_STORAGE_KEY = 'mozz_printer_browser_token_v1';

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

export const PRODUCTION_DEFAULT_API_URL = 'https://www.starters4u.in';
export const TEST_STUDIO_API_URL = 'https://starters4u.ai.studio';
export const DEV_DEFAULT_API_URL = 'http://localhost:3000';
export const STANDARDIZED_DEFAULT_API_URL = TEST_STUDIO_API_URL;

export function normalizeApiUrl(rawUrl?: string): string {
  let url = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!url) return TEST_STUDIO_API_URL;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  // Strip /admin if user entered the pairing admin page URL instead of the base API URL
  if (url.endsWith('/admin')) {
    url = url.slice(0, -6);
  }
  // Disallow admin.starters4u.in as agent API URL
  if (url.includes('admin.starters4u.in')) {
    url = url.replace('admin.starters4u.in', 'www.starters4u.in');
  }
  return url;
}

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '••••••••';
  const prefix = token.slice(0, 4);
  const suffix = token.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

const DEFAULT_SETTINGS: AppSettings = {
  apiUrl: TEST_STUDIO_API_URL,
  restaurantId: '',
  branchId: '',
  restaurantName: '',
  branchName: '',
  deviceId: 'win-pos-preview-01',
  deviceName: 'Windows POS Terminal 01',
  isRegistered: false,
  autoStartOnBoot: false,
  minimizeToTray: true,
  mockPrintersEnabled: true,
  hasToken: false,
  maskedToken: '',
  lastHeartbeatAt: undefined,
  lastHeartbeatStatus: undefined,
  lastHeartbeatError: undefined,
};

// No simulated orders or demo data in production builds
const INITIAL_JOBS: PrintJob[] = [];

class BrowserPrintAgentStore {
  private data: BrowserStoreData;
  private deviceToken: string | null = null;
  private heartbeatTimer: any = null;
  private pollingTimer: any = null;
  private statusListeners = new Set<(status: AgentConnectionStatus) => void>();
  private jobListeners = new Set<(event: { type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED'; job: PrintJob }) => void>();

  constructor() {
    this.data = this.load();
    this.deviceToken = this.loadToken();

    // If already registered and token present, immediately send first heartbeat and start background sync
    if (this.data.settings.isRegistered && this.deviceToken) {
      this.sendHeartbeatNow().catch(() => {});
      this.startBackgroundServices();
    }
  }

  private loadToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  }

  private load(): BrowserStoreData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.settings) {
          const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
          return {
            ...parsed,
            settings: {
              ...DEFAULT_SETTINGS,
              ...parsed.settings,
              hasToken: Boolean(storedToken),
              maskedToken: storedToken ? maskToken(storedToken) : '',
            },
            printers: parsed.printers || DEFAULT_PRINTERS,
            printerConfigs: parsed.printerConfigs || DEFAULT_CONFIGS,
            jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
            startedAt: parsed.startedAt || Date.now(),
            status: parsed.settings?.isRegistered && storedToken ? 'connected_sse' : 'unauthorized',
          };
        }
      }
    } catch {
      // ignore
    }

    const initial: BrowserStoreData = {
      settings: { ...DEFAULT_SETTINGS },
      printers: DEFAULT_PRINTERS,
      printerConfigs: DEFAULT_CONFIGS,
      jobs: INITIAL_JOBS,
      status: 'unauthorized',
      startedAt: Date.now(),
    };
    this.save(initial);
    return initial;
  }

  private save(data: BrowserStoreData): void {
    try {
      // Strip any raw token from stored settings
      const cleanSettings = { ...data.settings };
      delete (cleanSettings as any).deviceToken;
      delete (cleanSettings as any).token;

      const cleanData: BrowserStoreData = {
        ...data,
        settings: cleanSettings,
        jobs: data.jobs.slice(0, 100), // retain recent 100 local tickets
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanData));
    } catch {
      // ignore
    }
  }

  getSettings(): AppSettings {
    return {
      ...this.data.settings,
      hasToken: Boolean(this.deviceToken),
      maskedToken: this.deviceToken ? maskToken(this.deviceToken) : '',
    };
  }

  saveSettings(updates: Partial<AppSettings>): AppSettings {
    const cleanUpdates = { ...updates };
    delete (cleanUpdates as any).deviceToken;
    delete (cleanUpdates as any).token;

    if (typeof cleanUpdates.apiUrl === 'string') {
      cleanUpdates.apiUrl = normalizeApiUrl(cleanUpdates.apiUrl);
    }

    this.data.settings = {
      ...this.data.settings,
      ...cleanUpdates,
    };
    this.save(this.data);

    // If apiUrl changed and device is registered, verify connection with immediate heartbeat
    if (this.data.settings.isRegistered && this.deviceToken) {
      this.sendHeartbeatNow().catch(() => {});
    }

    return this.getSettings();
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
    const printed = this.data.jobs.filter(
      (j) => j.status === 'PRINTED' || j.status === 'submitted_to_spooler'
    ).length;
    const failed = this.data.jobs.filter((j) => j.status === 'FAILED').length;
    const pending = this.data.jobs.filter(
      (j) => j.status === 'PENDING' || j.status === 'PRINTING'
    ).length;

    return {
      totalJobsReceived: this.data.jobs.length,
      totalJobsPrinted: printed,
      totalJobsFailed: failed,
      pendingQueueLength: pending,
      connectionUptimeSeconds: Math.floor((Date.now() - this.data.startedAt) / 1000),
      lastSyncTime: this.data.settings.lastHeartbeatAt
        ? new Date(this.data.settings.lastHeartbeatAt).toLocaleTimeString()
        : 'Awaiting ping...',
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
    return this.data.jobs.filter((j) => j.status === 'PENDING' || j.status === 'PRINTING');
  }

  getFailedJobs(): PrintJob[] {
    return this.data.jobs.filter((j) => j.status === 'FAILED');
  }

  getJobHistory(limit = 100): PrintJob[] {
    return this.data.jobs.slice(0, limit);
  }

  subscribeStatus(cb: (status: AgentConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  subscribeJobs(
    cb: (event: { type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED'; job: PrintJob }) => void
  ): () => void {
    this.jobListeners.add(cb);
    return () => this.jobListeners.delete(cb);
  }

  private dispatchJobEvent(
    type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED',
    job: PrintJob
  ) {
    for (const listener of this.jobListeners) {
      try {
        listener({ type, job });
      } catch (err) {
        console.error(err);
      }
    }
  }

  // =========================================================================
  // PART A — Pairing & Device Heartbeat Logic
  // =========================================================================

  /**
   * Fast 6-digit pairing code redemption against backend
   */
  async pairDeviceWithCode(payload: {
    apiUrl: string;
    pairingCode: string;
    deviceId?: string;
    deviceName?: string;
  }): Promise<{
    success: boolean;
    deviceName?: string;
    restaurantName?: string;
    branchName?: string;
    error?: string;
  }> {
    try {
      const cleanUrl = normalizeApiUrl(payload.apiUrl);
      const deviceId =
        payload.deviceId ||
        this.data.settings.deviceId ||
        `win_pos_preview_${Math.random().toString(36).substring(2, 8)}`;
      const deviceName =
        payload.deviceName ||
        this.data.settings.deviceName ||
        'Windows POS Terminal (Preview)';

      const res = await fetch(`${cleanUrl}/api/print-agent/devices/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairingCode: payload.pairingCode.trim(),
          deviceId,
          deviceName,
          platform: 'win32',
          appVersion: '1.0.0',
        }),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as any;
        return {
          success: false,
          error:
            errBody?.error ||
            errBody?.message ||
            `Pairing failed with status ${res.status} (${res.statusText})`,
        };
      }

      const data = (await res.json()) as any;
      const plainToken = data.deviceToken || data.token;

      if (!plainToken) {
        return { success: false, error: 'Server did not issue a device token' };
      }

      const restaurantId = data.restaurant?.id || data.restaurantId || '';
      const restaurantName = data.restaurant?.name || data.restaurantName || 'Starters4U';
      const branchId = data.branch?.id || data.branchId || '';
      const branchName = data.branch?.name || data.branchName || 'Main Branch';

      // Persist token in browser storage
      try {
        localStorage.setItem(TOKEN_STORAGE_KEY, plainToken);
      } catch {
        // ignore
      }
      this.deviceToken = plainToken;

      // Immediately persist credentials & state
      this.data.settings = {
        ...this.data.settings,
        apiUrl: cleanUrl,
        deviceId,
        deviceName,
        restaurantId,
        restaurantName,
        branchId,
        branchName,
        isRegistered: true,
        hasToken: true,
        maskedToken: maskToken(plainToken),
        lastHeartbeatAt: new Date().toISOString(),
        lastHeartbeatStatus: 'online',
        lastHeartbeatError: undefined,
      };
      this.save(this.data);
      this.setStatus('connected_sse');

      // Immediately send the first heartbeat using the newly redeemed credentials; do not wait for React state to refresh
      await this.sendHeartbeatNow();

      // Start periodic heartbeat (30s) and job sync (15s)
      this.startBackgroundServices();

      return {
        success: true,
        deviceName,
        restaurantName,
        branchName,
      };
    } catch (err: any) {
      const errorMsg =
        err.message || 'Connection error during device pairing. Ensure backend URL is accessible.';
      this.data.settings.lastHeartbeatError = errorMsg;
      this.save(this.data);
      return { success: false, error: errorMsg };
    }
  }

  async registerDevice(payload: {
    apiUrl: string;
    restaurantId: string;
    branchId: string;
    deviceId: string;
    deviceName: string;
  }): Promise<{ success: boolean; deviceName: string; error?: string }> {
    const res = await this.pairDeviceWithCode({
      apiUrl: payload.apiUrl,
      pairingCode: '000000',
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
    });
    return {
      success: res.success,
      deviceName: res.deviceName || payload.deviceName,
      error: res.error,
    };
  }

  async disconnectDevice(): Promise<{ success: boolean }> {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    this.deviceToken = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollingTimer) clearInterval(this.pollingTimer);

    this.data.settings = {
      ...this.data.settings,
      isRegistered: false,
      hasToken: false,
      maskedToken: '',
      lastHeartbeatStatus: 'unauthorized',
      lastHeartbeatError: 'Device disconnected / unlinked',
    };
    this.save(this.data);
    this.setStatus('unauthorized');
    return { success: true };
  }

  /**
   * Immediately sends a heartbeat ping to backend.
   * Calls POST /api/print-agent/devices/heartbeat with fallback to /api/print-agent/heartbeat.
   */
  async sendHeartbeatNow(): Promise<{ ok: boolean; status?: string; error?: string }> {
    if (!this.data.settings.isRegistered || !this.deviceToken || !this.data.settings.apiUrl) {
      return { ok: false, error: 'Device not registered or token missing' };
    }

    const cleanUrl = normalizeApiUrl(this.data.settings.apiUrl);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.deviceToken}`,
      'x-device-token': this.deviceToken,
    };
    const body = JSON.stringify({
      deviceId: this.data.settings.deviceId,
      restaurantId: this.data.settings.restaurantId,
      branchId: this.data.settings.branchId,
    });

    try {
      let endpoint = `${cleanUrl}/api/print-agent/devices/heartbeat`;
      let res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
      });

      if (res.status === 404) {
        endpoint = `${cleanUrl}/api/print-agent/heartbeat`;
        res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body,
        });
      }

      if (res.ok) {
        this.data.settings.lastHeartbeatAt = new Date().toISOString();
        this.data.settings.lastHeartbeatStatus = 'online';
        this.data.settings.lastHeartbeatError = undefined;
        this.setStatus('connected_sse');
        this.save(this.data);
        return { ok: true, status: 'online' };
      } else {
        let errMessage = `HTTP ${res.status}: ${res.statusText}`;
        try {
          const errJson = await res.json();
          if (errJson?.error || errJson?.message) {
            errMessage = errJson.error || errJson.message;
          }
        } catch {
          // ignore
        }

        if (res.status === 401 || res.status === 403) {
          this.data.settings.lastHeartbeatStatus = 'unauthorized';
          this.data.settings.lastHeartbeatError = '401 Unauthorized: Invalid or revoked device token';
          this.setStatus('unauthorized');
        } else {
          this.data.settings.lastHeartbeatStatus = 'offline';
          this.data.settings.lastHeartbeatError = errMessage;
          this.setStatus('disconnected');
        }
        this.save(this.data);
        return { ok: false, error: errMessage };
      }
    } catch (err: any) {
      const errMessage = err?.message || 'Network unreachable / CORS blocked';
      this.data.settings.lastHeartbeatStatus = 'offline';
      this.data.settings.lastHeartbeatError = errMessage;
      this.setStatus('disconnected');
      this.save(this.data);
      return { ok: false, error: errMessage };
    }
  }

  /**
   * Starts background heartbeat (30s) and scalable polling fallback (15s)
   */
  startBackgroundServices(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollingTimer) clearInterval(this.pollingTimer);

    // 1. Heartbeat every 30 seconds
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeatNow();
    }, 30000);

    // 2. Poll pending jobs every 15 seconds
    this.pollingTimer = setInterval(async () => {
      await this.pollPendingJobs();
    }, 15000);
  }

  // =========================================================================
  // PART B — Live Print Job Sync, Duplicate Prevention & Tenant Isolation
  // =========================================================================

  private async pollPendingJobs(): Promise<void> {
    if (!this.data.settings.isRegistered || !this.deviceToken || !this.data.settings.apiUrl) {
      return;
    }

    const cleanUrl = normalizeApiUrl(this.data.settings.apiUrl);
    const headers = {
      Authorization: `Bearer ${this.deviceToken}`,
      'x-device-token': this.deviceToken,
    };

    try {
      const res = await fetch(`${cleanUrl}/api/print-agent/jobs?status=PENDING`, {
        headers,
      });

      if (res.status === 401 || res.status === 403) {
        this.data.settings.lastHeartbeatStatus = 'unauthorized';
        this.setStatus('unauthorized');
        return;
      }

      if (!res.ok) return;

      const jobs = (await res.json()) as PrintJob[];
      if (!Array.isArray(jobs) || jobs.length === 0) return;

      for (const job of jobs) {
        await this.processIncomingLiveJob(job);
      }
    } catch {
      // network or CORS issue, handled gracefully
    }
  }

  private async processIncomingLiveJob(job: PrintJob): Promise<boolean> {
    if (!this.deviceToken) return false;
    const settings = this.data.settings;
    const cleanUrl = normalizeApiUrl(settings.apiUrl);

    // Tenant Isolation Check
    if (job.restaurantId && settings.restaurantId && job.restaurantId !== settings.restaurantId) {
      console.warn(
        `[BrowserPrintAgent] Tenant isolation violation: job restaurantId ${job.restaurantId} does not match device restaurantId ${settings.restaurantId}. Skipping.`
      );
      return false;
    }
    if (job.branchId && settings.branchId && job.branchId !== settings.branchId) {
      console.warn(
        `[BrowserPrintAgent] Tenant isolation violation: job branchId ${job.branchId} does not match device branchId ${settings.branchId}. Skipping.`
      );
      return false;
    }

    // Duplicate Prevention Check
    const alreadyProcessed = this.data.jobs.some(
      (j) =>
        j.id === job.id &&
        (j.status === 'PRINTED' ||
          j.status === 'submitted_to_spooler' ||
          j.status === 'SUBMITTED_TO_SPOOLER')
    );
    if (alreadyProcessed) {
      return true;
    }

    // Claim job on backend
    try {
      const claimRes = await fetch(`${cleanUrl}/api/print-agent/jobs/${job.id}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.deviceToken}`,
          'x-device-token': this.deviceToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceId: settings.deviceId }),
      });
      if (claimRes.status === 409) {
        // Claimed by another device
        return false;
      }
    } catch {
      // proceed
    }

    // Update status to PRINTING
    try {
      await fetch(`${cleanUrl}/api/print-agent/jobs/${job.id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.deviceToken}`,
          'x-device-token': this.deviceToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'PRINTING', deviceId: settings.deviceId }),
      });
    } catch {
      // ignore
    }

    // Record job in local state
    const processedJob: PrintJob = {
      ...job,
      status: 'submitted_to_spooler',
      printedAt: new Date().toISOString(),
    };
    this.data.jobs.unshift(processedJob);
    this.save(this.data);
    this.dispatchJobEvent('NEW_JOB', processedJob);
    this.dispatchJobEvent('JOB_COMPLETED', processedJob);

    // Update status to PRINTED on backend
    try {
      await fetch(`${cleanUrl}/api/print-agent/jobs/${job.id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.deviceToken}`,
          'x-device-token': this.deviceToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'PRINTED', deviceId: settings.deviceId }),
      });
    } catch {
      // ignore
    }

    return true;
  }

  // =========================================================================
  // Manual Actions & Test Prints
  // =========================================================================

  async testPrint(payload: {
    type: PrintJobType;
    station: PrinterStation;
    paperWidthMm: PaperWidthMm;
    customPrinterName?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const testTimestamp = Date.now();
    const testOrderId = `TEST-${testTimestamp}`;

    const testKotPayload: KotTicketPayload = {
      isTest: true,
      restaurantName: this.data.settings.restaurantName || 'Starters4U Test Kitchen',
      branchName: this.data.settings.branchName || 'Madhapur Outlet',
      kotNumber: `KOT-TEST-${testTimestamp}`,
      orderNumber: testOrderId,
      orderType: 'Test Print Drill',
      tableNumber: 'TEST-01',
      station: payload.station,
      orderTime: new Date().toISOString(),
      items: [
        {
          name: 'Paneer Tikka (Test)',
          quantity: 1,
          specialInstructions: 'Extra spicy test item',
        },
        {
          name: 'Crispy Corn Salt & Pepper',
          quantity: 2,
        },
      ],
    };

    const testBillPayload: BillTicketPayload = {
      isTest: true,
      restaurantName: this.data.settings.restaurantName || 'Starters4U Test Kitchen',
      branchName: this.data.settings.branchName || 'Madhapur Outlet',
      billNumber: `BILL-TEST-${testTimestamp}`,
      orderNumber: testOrderId,
      orderTime: new Date().toISOString(),
      orderType: 'Test Billing Drill',
      tableNumber: 'TEST-01',
      customerName: 'Test Drill Customer',
      customerPhone: '9876543210',
      items: [
        { name: 'Paneer Tikka (Test)', quantity: 1, unitPrice: 240, itemTotal: 240 },
        { name: 'Crispy Corn Salt & Pepper', quantity: 2, unitPrice: 180, itemTotal: 360 },
      ],
      itemTotal: 600,
      discount: 0,
      tax: 30,
      deliveryFee: 0,
      grandTotal: 630,
      paymentMethod: 'Cash (Test)',
      paymentStatus: 'PAID',
    };

    const testJob: PrintJob = {
      id: `TEST-${testTimestamp}`,
      isTest: true,
      restaurantId: this.data.settings.restaurantId || 'starters4u_main',
      branchId: this.data.settings.branchId || 'branch_madhapur',
      orderId: `ord_test_${testTimestamp}`,
      orderNumber: testOrderId,
      jobType: payload.type,
      station: payload.station,
      status: 'submitted_to_spooler',
      printerName: payload.customPrinterName || 'MOCK_PRINTER',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      printedAt: new Date().toISOString(),
      payload: payload.type === 'KOT' ? testKotPayload : testBillPayload,
    };

    this.data.jobs.unshift(testJob);
    this.save(this.data);
    this.dispatchJobEvent('NEW_JOB', testJob);
    this.dispatchJobEvent('JOB_COMPLETED', testJob);

    return { success: true };
  }

  async retryJob(jobId: string): Promise<{ success: boolean; error?: string }> {
    const job = this.data.jobs.find((j) => j.id === jobId);
    if (!job) return { success: false, error: 'Job not found' };
    job.status = 'submitted_to_spooler';
    job.printedAt = new Date().toISOString();
    this.save(this.data);
    this.dispatchJobEvent('JOB_UPDATED', job);
    return { success: true };
  }

  async reprintJob(jobId: string, station?: string): Promise<{ success: boolean; error?: string }> {
    const existing = this.data.jobs.find((j) => j.id === jobId);
    if (!existing) return { success: false, error: 'Job not found' };

    const reprintJob: PrintJob = {
      ...existing,
      id: `REPRINT-${Date.now()}-${existing.id}`,
      station: station || existing.station,
      status: 'submitted_to_spooler',
      isReprint: true,
      createdAt: new Date().toISOString(),
      printedAt: new Date().toISOString(),
    };
    this.data.jobs.unshift(reprintJob);
    this.save(this.data);
    this.dispatchJobEvent('NEW_JOB', reprintJob);
    return { success: true };
  }

  clearCompletedJobs(): { count: number } {
    const initialLen = this.data.jobs.length;
    this.data.jobs = this.data.jobs.filter(
      (j) => j.status !== 'PRINTED' && j.status !== 'submitted_to_spooler'
    );
    const count = initialLen - this.data.jobs.length;
    this.save(this.data);
    return { count };
  }

  deleteJob(jobId: string): { success: boolean } {
    const idx = this.data.jobs.findIndex((j) => j.id === jobId);
    if (idx >= 0) {
      this.data.jobs.splice(idx, 1);
      this.save(this.data);
      return { success: true };
    }
    return { success: false };
  }

  deleteJobs(jobIds: string[]): { count: number; success: boolean } {
    const idSet = new Set(jobIds);
    const initialLen = this.data.jobs.length;
    this.data.jobs = this.data.jobs.filter((j) => !idSet.has(j.id));
    const count = initialLen - this.data.jobs.length;
    this.save(this.data);
    return { count, success: true };
  }

  cancelJob(jobId: string, _reason = 'Cancelled by operator'): { success: boolean } {
    const job = this.data.jobs.find((j) => j.id === jobId);
    if (job) {
      job.status = 'CANCELLED';
      this.save(this.data);
      this.dispatchJobEvent('JOB_UPDATED', job);
      return { success: true };
    }
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
