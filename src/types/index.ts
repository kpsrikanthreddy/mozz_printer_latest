export type PrintJobType = 'KOT' | 'BILL';

export type PrintJobStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'PRINTING'
  | 'PRINTED'
  | 'FAILED'
  | 'UNCERTAIN_RECOVERY'
  | 'SKIPPED';

export type PrinterStation =
  | 'billing'
  | 'kitchen_master'
  | 'kitchen_pizza'
  | 'bar_beverage';

export type PaperWidthMm = 58 | 80 | 'A4_TEST';

export interface PrinterConfig {
  station: PrinterStation;
  printerName: string; // Windows driver device name or 'MOCK_PRINTER'
  paperWidthMm: PaperWidthMm;
  copies: number;
  isAutoPrint: boolean;
}

export interface DiscoveredPrinter {
  name: string;
  displayName: string;
  description?: string;
  isDefault: boolean;
  status?: number;
  isOnline: boolean;
}

export interface KotItem {
  name: string;
  quantity: number;
  selectedShape?: string;
  selectedCrust?: string;
  spiceLevel?: string;
  addons?: string[];
  specialInstructions?: string;
  category?: string;
}

export interface KotTicketPayload {
  restaurantName: string;
  branchName?: string;
  kotNumber: string;
  orderNumber: string;
  orderType: string;
  tableNumber?: string;
  orderTime: string;
  isReprint?: boolean;
  station: string;
  specialInstructions?: string;
  items: KotItem[];
}

export interface BillItem {
  name: string;
  quantity: number;
  unitPrice: number;
  itemTotal: number;
  selectedShape?: string;
  selectedCrust?: string;
  addons?: string[];
}

export interface BillTicketPayload {
  restaurantName: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  gstin?: string;
  billNumber: string;
  orderNumber: string;
  orderTime: string;
  orderType: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  isReprint?: boolean;
  items: BillItem[];
  itemTotal: number;
  discount: number;
  tax: number;
  taxRate?: number;
  deliveryFee: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
}

export interface PrintJob {
  id: string;
  restaurantId: string;
  branchId: string;
  orderId: string;
  orderNumber: string;
  jobType: PrintJobType;
  station: string;
  status: PrintJobStatus;
  payload: KotTicketPayload | BillTicketPayload;
  errorMessage?: string;
  retryCount: number;
  maxRetries?: number;
  idempotencyKey?: string;
  claimedByDeviceId?: string;
  isReprint?: boolean;
  createdAt: string;
  updatedAt?: string;
  claimedAt?: string;
  printedAt?: string;
  failedAt?: string;
  localReceivedAt?: string;
}

export interface PrintAttemptLog {
  id: string;
  jobId: string;
  attemptNumber: number;
  status: 'SUCCESS' | 'FAILURE';
  printerName: string;
  errorMessage?: string;
  durationMs: number;
  timestamp: string;
}

export type AgentConnectionStatus =
  | 'connected_sse'
  | 'connected_polling'
  | 'reconnecting'
  | 'disconnected'
  | 'unauthorized';

export interface AppSettings {
  apiUrl: string;
  restaurantId: string;
  branchId: string;
  restaurantName: string;
  branchName: string;
  deviceId: string;
  deviceName: string;
  isRegistered: boolean;
  autoStartOnBoot: boolean;
  minimizeToTray: boolean;
  mockPrintersEnabled: boolean;
  hasToken?: boolean;
  maskedToken?: string;
  lastHeartbeatAt?: string;
}

export interface AgentMetrics {
  totalJobsReceived: number;
  totalJobsPrinted: number;
  totalJobsFailed: number;
  pendingQueueLength: number;
  connectionUptimeSeconds: number;
  lastSyncTime?: string;
}

// IPC contract exposed to React renderer
export interface MozzPrinterAPI {
  // Connection & Settings
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  getConnectionStatus: () => Promise<AgentConnectionStatus>;
  getMetrics: () => Promise<AgentMetrics>;
  onConnectionStatusChange: (callback: (status: AgentConnectionStatus) => void) => () => void;
  onJobEvent: (callback: (event: { type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED'; job: PrintJob }) => void) => () => void;

  // Device Registration
  pairDeviceWithCode: (payload: {
    apiUrl: string;
    pairingCode: string;
    deviceId?: string;
    deviceName?: string;
  }) => Promise<{ success: boolean; deviceName?: string; error?: string }>;
  registerDevice: (payload: {
    apiUrl: string;
    restaurantId: string;
    branchId: string;
    deviceId: string;
    deviceName: string;
  }) => Promise<{ success: boolean; deviceName: string; error?: string }>;
  disconnectDevice: () => Promise<{ success: boolean }>;

  // Printers & Hardware
  getAvailablePrinters: () => Promise<DiscoveredPrinter[]>;
  getPrinterConfigs: () => Promise<PrinterConfig[]>;
  savePrinterConfig: (config: PrinterConfig) => Promise<{ success: boolean }>;
  testPrint: (payload: {
    type: PrintJobType;
    station: PrinterStation;
    paperWidthMm: PaperWidthMm;
    customPrinterName?: string;
  }) => Promise<{ success: boolean; error?: string }>;

  // Queue & Print Management
  getPendingJobs: () => Promise<PrintJob[]>;
  getFailedJobs: () => Promise<PrintJob[]>;
  getJobHistory: (limit?: number) => Promise<PrintJob[]>;
  retryJob: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  reprintJob: (jobId: string, station?: string) => Promise<{ success: boolean; error?: string }>;
  clearCompletedJobs: () => Promise<{ count: number }>;

  // App & Window Control
  openExternal: (url: string) => Promise<void>;
  minimizeWindow: () => void;
  closeWindow: () => void;
  getAppVersion: () => Promise<string>;

  // Runtime Environment Flag
  isElectron?: boolean;
  isBrowserPreview?: boolean;
}

declare global {
  interface Window {
    mozzPrinterAPI: MozzPrinterAPI;
  }
}
