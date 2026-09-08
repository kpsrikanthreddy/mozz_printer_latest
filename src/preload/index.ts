import { contextBridge, ipcRenderer } from 'electron';
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
} from '../types/index.js';

const api = {
  // Settings & Status
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('save-settings', settings),
  getConnectionStatus: (): Promise<AgentConnectionStatus> =>
    ipcRenderer.invoke('get-connection-status'),
  getMetrics: (): Promise<AgentMetrics> => ipcRenderer.invoke('get-metrics'),

  onConnectionStatusChange: (callback: (status: AgentConnectionStatus) => void) => {
    const handler = (_event: any, status: AgentConnectionStatus) => callback(status);
    ipcRenderer.on('connection-status-changed', handler);
    return () => {
      ipcRenderer.removeListener('connection-status-changed', handler);
    };
  },

  onJobEvent: (
    callback: (event: {
      type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED';
      job: PrintJob;
    }) => void
  ) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('job-event', handler);
    return () => {
      ipcRenderer.removeListener('job-event', handler);
    };
  },

  // Device Auth & Onboarding
  pairDeviceWithCode: (payload: {
    apiUrl: string;
    pairingCode: string;
    deviceId?: string;
    deviceName?: string;
  }): Promise<{ success: boolean; deviceName?: string; error?: string }> =>
    ipcRenderer.invoke('pair-device-with-code', payload),

  registerDevice: (payload: {
    apiUrl: string;
    restaurantId: string;
    branchId: string;
    deviceId: string;
    deviceName: string;
  }): Promise<{ success: boolean; deviceName: string; error?: string }> =>
    ipcRenderer.invoke('register-device', payload),

  disconnectDevice: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('disconnect-device'),

  // Hardware & Printers
  getAvailablePrinters: (): Promise<DiscoveredPrinter[]> =>
    ipcRenderer.invoke('get-available-printers'),
  getPrinterConfigs: (): Promise<PrinterConfig[]> =>
    ipcRenderer.invoke('get-printer-configs'),
  savePrinterConfig: (config: PrinterConfig): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('save-printer-config', config),
  testPrint: (payload: {
    type: PrintJobType;
    station: PrinterStation;
    paperWidthMm: PaperWidthMm;
    customPrinterName?: string;
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('test-print', payload),

  // Print Queue & History
  getPendingJobs: (): Promise<PrintJob[]> => ipcRenderer.invoke('get-pending-jobs'),
  getFailedJobs: (): Promise<PrintJob[]> => ipcRenderer.invoke('get-failed-jobs'),
  getJobHistory: (limit?: number): Promise<PrintJob[]> =>
    ipcRenderer.invoke('get-job-history', limit),
  retryJob: (jobId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('retry-job', jobId),
  reprintJob: (jobId: string, station?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('reprint-job', jobId, station),
  clearCompletedJobs: (): Promise<{ count: number }> =>
    ipcRenderer.invoke('clear-completed-jobs'),

  // Window Controls
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  isElectron: true,
  isBrowserPreview: false,
};

contextBridge.exposeInMainWorld('mozzPrinterAPI', api);
