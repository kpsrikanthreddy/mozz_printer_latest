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

const INITIAL_JOBS: PrintJob[] = [
  {
    id: 'job_kot_101',
    restaurantId: 'rest_starters4u_01',
    branchId: 'branch_madhapur_01',
    orderId: 'ord_9821',
    orderNumber: 'S4U-9821',
    jobType: 'KOT',
    station: 'kitchen_master',
    status: 'PRINTED',
    retryCount: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    printedAt: new Date(Date.now() - 1000 * 60 * 17).toISOString(),
    payload: {
      restaurantName: 'Starters4U',
      branchName: 'Madhapur Outlet',
      kotNumber: 'KOT-101',
      orderNumber: 'S4U-9821',
      orderType: 'Dine-In',
      tableNumber: 'T-04',
      station: 'kitchen_master',
      orderTime: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      items: [
        {
          name: 'Paneer Butter Masala',
          quantity: 1,
          spiceLevel: 'Medium Spicy',
          specialInstructions: 'Less butter, extra coriander',
        },
        {
          name: 'Butter Garlic Naan',
          quantity: 4,
          addons: ['Crispy Garlic'],
        },
        {
          name: 'Crispy Corn Salt & Pepper',
          quantity: 1,
          spiceLevel: 'Spicy',
        },
      ],
    } as KotTicketPayload,
  },
  {
    id: 'job_bill_101',
    restaurantId: 'rest_starters4u_01',
    branchId: 'branch_madhapur_01',
    orderId: 'ord_9821',
    orderNumber: 'S4U-9821',
    jobType: 'BILL',
    station: 'billing',
    status: 'PRINTED',
    retryCount: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    printedAt: new Date(Date.now() - 1000 * 60 * 13).toISOString(),
    payload: {
      restaurantName: 'Starters4U',
      branchName: 'Madhapur Outlet',
      branchAddress: 'Plot 42, Hitech City Main Rd, Madhapur, Hyderabad, TS 500081',
      branchPhone: '+91 98765 43210',
      gstin: '36AAAAA0000A1Z5',
      billNumber: 'BILL-4089',
      orderNumber: 'S4U-9821',
      orderTime: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      orderType: 'Dine-In',
      tableNumber: 'T-04',
      customerName: 'Rohit Sharma',
      customerPhone: '+91 99887 76655',
      items: [
        { name: 'Paneer Butter Masala', quantity: 1, unitPrice: 320, itemTotal: 320 },
        { name: 'Butter Garlic Naan', quantity: 4, unitPrice: 65, itemTotal: 260 },
        { name: 'Crispy Corn Salt & Pepper', quantity: 1, unitPrice: 220, itemTotal: 220 },
      ],
      itemTotal: 800,
      discount: 0,
      tax: 40,
      taxRate: 5,
      deliveryFee: 0,
      grandTotal: 840,
      paymentMethod: 'UPI (PhonePe)',
      paymentStatus: 'PAID',
    } as BillTicketPayload,
  },
  {
    id: 'job_kot_102',
    restaurantId: 'rest_starters4u_01',
    branchId: 'branch_madhapur_01',
    orderId: 'ord_9825',
    orderNumber: 'S4U-9825',
    jobType: 'KOT',
    station: 'kitchen_pizza',
    status: 'PRINTED',
    retryCount: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    printedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    payload: {
      restaurantName: 'Starters4U',
      branchName: 'Madhapur Outlet',
      kotNumber: 'KOT-102',
      orderNumber: 'S4U-9825',
      orderType: 'Zomato Delivery',
      station: 'kitchen_pizza',
      orderTime: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
      items: [
        {
          name: 'Farmhouse Supreme Pizza 10"',
          quantity: 2,
          selectedCrust: 'Cheese Burst',
          selectedShape: 'Round',
          addons: ['Extra Jalapenos', 'Black Olives'],
        },
        {
          name: 'Stuffed Garlic Breadsticks',
          quantity: 1,
          specialInstructions: 'Include cheesy dip',
        },
      ],
    } as KotTicketPayload,
  },
  {
    id: 'job_kot_103',
    restaurantId: 'rest_starters4u_01',
    branchId: 'branch_madhapur_01',
    orderId: 'ord_9828',
    orderNumber: 'S4U-9828',
    jobType: 'KOT',
    station: 'bar_beverage',
    status: 'FAILED',
    errorMessage: 'Thermal printer buffer timeout: Xprinter XP-58 out of paper roll',
    retryCount: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    failedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    payload: {
      restaurantName: 'Starters4U',
      branchName: 'Madhapur Outlet',
      kotNumber: 'KOT-103',
      orderNumber: 'S4U-9828',
      orderType: 'Dine-In',
      tableNumber: 'T-11',
      station: 'bar_beverage',
      orderTime: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      items: [
        {
          name: 'Virgin Mint Mojito',
          quantity: 2,
          specialInstructions: 'Extra mint, crushed ice, less sugar syrup',
        },
        {
          name: 'Thick Cold Coffee with Brownie',
          quantity: 1,
        },
      ],
    } as KotTicketPayload,
  },
  {
    id: 'job_kot_104',
    restaurantId: 'rest_starters4u_01',
    branchId: 'branch_madhapur_01',
    orderId: 'ord_9831',
    orderNumber: 'S4U-9831',
    jobType: 'KOT',
    station: 'kitchen_master',
    status: 'PENDING',
    retryCount: 0,
    createdAt: new Date(Date.now() - 1000 * 35).toISOString(),
    payload: {
      restaurantName: 'Starters4U',
      branchName: 'Madhapur Outlet',
      kotNumber: 'KOT-104',
      orderNumber: 'S4U-9831',
      orderType: 'Takeaway Counter',
      station: 'kitchen_master',
      orderTime: new Date(Date.now() - 1000 * 35).toISOString(),
      items: [
        {
          name: 'Chicken Dum Biryani (Full)',
          quantity: 2,
          spiceLevel: 'Spicy',
          specialInstructions: 'Pack double salan and onion raita',
        },
        {
          name: 'Chicken 65 Hyderabadi',
          quantity: 1,
        },
      ],
    } as KotTicketPayload,
  },
];

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
        if (parsed && parsed.settings && Array.isArray(parsed.jobs)) {
          return {
            ...parsed,
            startedAt: parsed.startedAt || Date.now(),
            status: parsed.settings.isRegistered ? 'connected_sse' : 'unauthorized',
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    const printed = this.data.jobs.filter((j) => j.status === 'PRINTED').length;
    const failed = this.data.jobs.filter((j) => j.status === 'FAILED').length;
    const pending = this.data.jobs.filter((j) => j.status === 'PENDING' || j.status === 'CLAIMED' || j.status === 'PRINTING').length;
    const uptime = Math.floor((Date.now() - this.data.startedAt) / 1000);

    return {
      totalJobsReceived: this.data.jobs.length,
      totalJobsPrinted: printed,
      totalJobsFailed: failed,
      pendingQueueLength: pending,
      connectionUptimeSeconds: uptime,
      lastSyncTime: new Date().toISOString(),
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
    return this.data.jobs.filter(
      (j) => j.status === 'PENDING' || j.status === 'CLAIMED' || j.status === 'PRINTING'
    );
  }

  getFailedJobs(): PrintJob[] {
    return this.data.jobs.filter((j) => j.status === 'FAILED');
  }

  getJobHistory(limit = 100): PrintJob[] {
    return [...this.data.jobs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
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

  async pairDeviceWithCode(payload: {
    apiUrl: string;
    pairingCode: string;
    deviceId?: string;
    deviceName?: string;
  }): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    const cleanUrl = payload.apiUrl.replace(/\/$/, '');
    const deviceName = payload.deviceName || this.data.settings.deviceName || 'Windows POS Terminal 01';
    const deviceId = payload.deviceId || this.data.settings.deviceId || `win_pos_${Math.random().toString(36).substring(2, 8)}`;

    this.saveSettings({
      apiUrl: cleanUrl,
      deviceId,
      deviceName,
      isRegistered: true,
      hasToken: true,
      maskedToken: `ptk_win_••••••••••••${payload.pairingCode}`,
    });

    this.setStatus('connected_sse');
    return { success: true, deviceName };
  }

  async registerDevice(payload: {
    apiUrl: string;
    restaurantId: string;
    branchId: string;
    deviceId: string;
    deviceName: string;
  }): Promise<{ success: boolean; deviceName: string; error?: string }> {
    this.saveSettings({
      apiUrl: payload.apiUrl.replace(/\/$/, ''),
      restaurantId: payload.restaurantId,
      branchId: payload.branchId,
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
      isRegistered: true,
      hasToken: true,
      maskedToken: 'ptk_win_••••••••••••9482',
    });
    this.setStatus('connected_sse');
    return { success: true, deviceName: payload.deviceName };
  }

  async disconnectDevice(): Promise<{ success: boolean }> {
    this.saveSettings({
      isRegistered: false,
      hasToken: false,
    });
    this.setStatus('unauthorized');
    return { success: true };
  }

  async testPrint(payload: {
    type: PrintJobType;
    station: PrinterStation;
    paperWidthMm: PaperWidthMm;
    customPrinterName?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const jobNum = Math.floor(100 + Math.random() * 900);
    const orderNum = `TEST-${Math.floor(1000 + Math.random() * 9000)}`;

    let ticketPayload: KotTicketPayload | BillTicketPayload;

    if (payload.type === 'KOT') {
      ticketPayload = {
        restaurantName: this.data.settings.restaurantName || 'Starters4U',
        branchName: this.data.settings.branchName || 'Madhapur Outlet',
        kotNumber: `KOT-T${jobNum}`,
        orderNumber: orderNum,
        orderType: 'Test Print Drill',
        tableNumber: 'TEST-01',
        station: payload.station,
        orderTime: new Date().toISOString(),
        items: [
          {
            name: 'Test Pepperoni / Paneer Special',
            quantity: 1,
            selectedShape: 'Heart',
            selectedCrust: 'Thin Crust',
            spiceLevel: 'Medium',
            addons: ['Extra Cheese Dip'],
            specialInstructions: `Simulated 58mm/80mm thermal test print on ${payload.customPrinterName || 'Auto-spooler'}`,
          },
        ],
      };
    } else {
      ticketPayload = {
        restaurantName: this.data.settings.restaurantName || 'Starters4U',
        branchName: this.data.settings.branchName || 'Madhapur Outlet',
        branchAddress: 'Plot 42, Hitech City Main Rd, Madhapur, Hyderabad, TS',
        branchPhone: '+91 98765 43210',
        gstin: '36AAAAA0000A1Z5',
        billNumber: `BILL-T${jobNum}`,
        orderNumber: orderNum,
        orderTime: new Date().toISOString(),
        orderType: 'Test Bill Receipt',
        tableNumber: 'TEST-01',
        customerName: 'Test Customer',
        customerPhone: '+91 98000 12345',
        items: [
          { name: 'Starters4U Special Platter', quantity: 1, unitPrice: 450, itemTotal: 450 },
          { name: 'Fresh Mint Lime Soda', quantity: 2, unitPrice: 90, itemTotal: 180 },
        ],
        itemTotal: 630,
        discount: 30,
        tax: 30,
        taxRate: 5,
        deliveryFee: 0,
        grandTotal: 630,
        paymentMethod: 'Test Card Spool',
        paymentStatus: 'PAID_TEST',
      };
    }

    if (payload.customPrinterName && payload.customPrinterName !== 'MOCK_PRINTER') {
      const errorMsg = 'Browser preview—physical printing unavailable. Physical printing must work only inside the packaged Electron desktop application.';
      const failedJob: PrintJob = {
        id: `job_test_err_${Date.now()}`,
        restaurantId: this.data.settings.restaurantId || 'rest_starters4u_01',
        branchId: this.data.settings.branchId || 'branch_madhapur_01',
        orderId: `ord_${Date.now()}`,
        orderNumber: orderNum,
        jobType: payload.type,
        station: payload.station,
        status: 'FAILED',
        errorMessage: errorMsg,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
        payload: ticketPayload,
      };

      this.data.jobs.unshift(failedJob);
      this.save(this.data);
      this.dispatchJobEvent('NEW_JOB', failedJob);

      return {
        success: false,
        error: errorMsg,
      };
    }

    const testJob: PrintJob = {
      id: `job_test_${Date.now()}`,
      restaurantId: this.data.settings.restaurantId || 'rest_starters4u_01',
      branchId: this.data.settings.branchId || 'branch_madhapur_01',
      orderId: `ord_${Date.now()}`,
      orderNumber: orderNum,
      jobType: payload.type,
      station: payload.station,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      payload: ticketPayload,
    };

    this.data.jobs.unshift(testJob);
    this.save(this.data);
    this.dispatchJobEvent('NEW_JOB', testJob);

    // Transition to PRINTING then PRINTED in real time
    setTimeout(() => {
      testJob.status = 'PRINTING';
      this.save(this.data);
      this.dispatchJobEvent('JOB_UPDATED', testJob);

      setTimeout(() => {
        testJob.status = 'PRINTED';
        testJob.printedAt = new Date().toISOString();
        this.save(this.data);
        this.dispatchJobEvent('JOB_COMPLETED', testJob);
      }, 600);
    }, 300);

    return { success: true };
  }

  async retryJob(jobId: string): Promise<{ success: boolean; error?: string }> {
    const job = this.data.jobs.find((j) => j.id === jobId);
    if (!job) return { success: false, error: 'Job not found in queue' };

    job.status = 'PRINTING';
    job.errorMessage = undefined;
    job.retryCount += 1;
    this.save(this.data);
    this.dispatchJobEvent('JOB_UPDATED', job);

    setTimeout(() => {
      job.status = 'PRINTED';
      job.printedAt = new Date().toISOString();
      this.save(this.data);
      this.dispatchJobEvent('JOB_COMPLETED', job);
    }, 600);

    return { success: true };
  }

  async reprintJob(jobId: string, station?: string): Promise<{ success: boolean; error?: string }> {
    const originalJob = this.data.jobs.find((j) => j.id === jobId);
    if (!originalJob) return { success: false, error: 'Original job not found' };

    const reprintJob: PrintJob = {
      ...originalJob,
      id: `${originalJob.id}_reprint_${Date.now()}`,
      station: station || originalJob.station,
      isReprint: true,
      status: 'PRINTED',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      printedAt: new Date().toISOString(),
      payload: {
        ...originalJob.payload,
        isReprint: true,
      },
    };

    this.data.jobs.unshift(reprintJob);
    this.save(this.data);
    this.dispatchJobEvent('NEW_JOB', reprintJob);
    this.dispatchJobEvent('JOB_COMPLETED', reprintJob);

    return { success: true };
  }

  clearCompletedJobs(): { count: number } {
    const beforeCount = this.data.jobs.length;
    this.data.jobs = this.data.jobs.filter((j) => j.status !== 'PRINTED');
    const removed = beforeCount - this.data.jobs.length;
    this.save(this.data);
    return { count: removed };
  }

  deleteJob(jobId: string): { success: boolean } {
    const beforeCount = this.data.jobs.length;
    this.data.jobs = this.data.jobs.filter((j) => j.id !== jobId);
    const removed = beforeCount !== this.data.jobs.length;
    if (removed) {
      this.save(this.data);
    }
    return { success: removed };
  }

  deleteJobs(jobIds: string[]): { count: number; success: boolean } {
    const set = new Set(jobIds);
    const beforeCount = this.data.jobs.length;
    this.data.jobs = this.data.jobs.filter((j) => !set.has(j.id));
    const count = beforeCount - this.data.jobs.length;
    if (count > 0) {
      this.save(this.data);
    }
    return { count, success: true };
  }

  cancelJob(jobId: string, reason = 'Cancelled by operator'): { success: boolean } {
    const job = this.data.jobs.find((j) => j.id === jobId);
    if (!job) return { success: false };
    job.status = 'CANCELLED';
    job.errorMessage = reason;
    this.save(this.data);
    this.dispatchJobEvent('JOB_UPDATED', job);
    return { success: true };
  }

  // Simulate incoming live print job from Cloud POS
  simulateIncomingOrder(): PrintJob {
    const orderNum = `S4U-${Math.floor(1000 + Math.random() * 9000)}`;
    const kotNum = `KOT-${Math.floor(100 + Math.random() * 900)}`;
    const isKot = Math.random() > 0.35;

    const newJob: PrintJob = {
      id: `job_sim_${Date.now()}`,
      restaurantId: this.data.settings.restaurantId || 'rest_starters4u_01',
      branchId: this.data.settings.branchId || 'branch_madhapur_01',
      orderId: `ord_sim_${Date.now()}`,
      orderNumber: orderNum,
      jobType: isKot ? 'KOT' : 'BILL',
      station: isKot ? (Math.random() > 0.5 ? 'kitchen_master' : 'kitchen_pizza') : 'billing',
      status: 'PRINTING',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      payload: isKot
        ? ({
            restaurantName: 'Starters4U',
            branchName: 'Madhapur Outlet',
            kotNumber: kotNum,
            orderNumber: orderNum,
            orderType: 'Live Cloud POS Order',
            tableNumber: `T-0${Math.floor(1 + Math.random() * 9)}`,
            station: 'kitchen_master',
            orderTime: new Date().toISOString(),
            items: [
              {
                name: 'Crispy Veg Spring Rolls',
                quantity: 2,
                spiceLevel: 'Medium',
                specialInstructions: 'Serve with sweet chili dip',
              },
              {
                name: 'Paneer Makhani Pizza',
                quantity: 1,
                selectedCrust: 'Cheese Burst',
              },
            ],
          } as KotTicketPayload)
        : ({
            restaurantName: 'Starters4U',
            branchName: 'Madhapur Outlet',
            branchAddress: 'Plot 42, Hitech City Main Rd, Madhapur, Hyderabad, TS',
            branchPhone: '+91 98765 43210',
            gstin: '36AAAAA0000A1Z5',
            billNumber: `BILL-${Math.floor(5000 + Math.random() * 5000)}`,
            orderNumber: orderNum,
            orderTime: new Date().toISOString(),
            orderType: 'Dine-In',
            tableNumber: `T-0${Math.floor(1 + Math.random() * 9)}`,
            customerName: 'Aarav Patel',
            customerPhone: '+91 98765 11223',
            items: [
              { name: 'Crispy Veg Spring Rolls', quantity: 2, unitPrice: 210, itemTotal: 420 },
              { name: 'Paneer Makhani Pizza', quantity: 1, unitPrice: 380, itemTotal: 380 },
            ],
            itemTotal: 800,
            discount: 0,
            tax: 40,
            taxRate: 5,
            deliveryFee: 0,
            grandTotal: 840,
            paymentMethod: 'UPI',
            paymentStatus: 'PAID',
          } as BillTicketPayload),
    };

    this.data.jobs.unshift(newJob);
    this.save(this.data);
    this.dispatchJobEvent('NEW_JOB', newJob);

    setTimeout(() => {
      newJob.status = 'PRINTED';
      newJob.printedAt = new Date().toISOString();
      this.save(this.data);
      this.dispatchJobEvent('JOB_COMPLETED', newJob);
    }, 800);

    return newJob;
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

  // Also expose simulateIncomingOrder for testing
  (window as any).mozzPrinterSimulateOrder = () => {
    return store.simulateIncomingOrder();
  };

  return api;
}
