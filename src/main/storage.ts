import fs from 'fs';
import path from 'path';
import { secureTokenStorage, SecureTokenStorage } from './secureStorage.js';
import { sqliteQueue, SqlitePrintQueue } from './sqliteQueue.js';
import type {
  AppSettings,
  PrinterConfig,
  PrintJob,
  PrintAttemptLog,
  PrinterStation,
} from '../types/index.js';

let electronApp: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  if (typeof electron === 'object' && electron !== null && electron.app) {
    electronApp = electron.app;
  }
} catch {
  // outside electron runtime
}

// JSON storage is used ONLY for lightweight non-critical preferences (window sizes, UI toggles, restaurant metadata).
// All jobs, idempotency tracking, spool logs, and printer configs live securely in SQLite.
// Device token is NEVER stored in JSON or SQLite: it lives encrypted via safeStorage in secureStorage.ts.
interface PreferencesSchema {
  settings: AppSettings;
}

const isDevelopment = process.env.NODE_ENV === 'development';
export const PRODUCTION_DEFAULT_API_URL = 'https://www.starters4u.in';
export const DEV_DEFAULT_API_URL = 'http://localhost:3000';

// Standardize backend URL:
// In Electron main process, priority is MOZZ_API_URL, then STARTERS4U_API_URL.
// http://localhost:3000 is used strictly for local development.
// Production defaults to https://www.starters4u.in.
export const RESOLVED_DEFAULT_API_URL =
  process.env.MOZZ_API_URL ||
  process.env.STARTERS4U_API_URL ||
  (isDevelopment ? DEV_DEFAULT_API_URL : PRODUCTION_DEFAULT_API_URL);

const DEFAULT_SETTINGS: AppSettings = {
  apiUrl: RESOLVED_DEFAULT_API_URL,
  restaurantId: '',
  branchId: '',
  restaurantName: '',
  branchName: '',
  deviceId: '',
  deviceName: '',
  isRegistered: false,
  autoStartOnBoot: false,
  minimizeToTray: true,
  mockPrintersEnabled: false,
};

const DEFAULT_PRINTER_CONFIGS: PrinterConfig[] = [
  {
    station: 'billing',
    printerName: 'MOCK_PRINTER',
    paperWidthMm: 80,
    copies: 1,
    isAutoPrint: true,
  },
  {
    station: 'kitchen_master',
    printerName: 'MOCK_PRINTER',
    paperWidthMm: 80,
    copies: 1,
    isAutoPrint: true,
  },
  {
    station: 'kitchen_pizza',
    printerName: 'MOCK_PRINTER',
    paperWidthMm: 58,
    copies: 1,
    isAutoPrint: true,
  },
  {
    station: 'bar_beverage',
    printerName: 'MOCK_PRINTER',
    paperWidthMm: 58,
    copies: 1,
    isAutoPrint: false,
  },
];

export class LocalStorageManager {
  private filePath: string;
  private preferences: PreferencesSchema;
  private queue: SqlitePrintQueue;
  private tokenStore: SecureTokenStorage;

  constructor(customDir?: string) {
    let baseDir: string = customDir || '';
    if (!baseDir) {
      try {
        baseDir =
          electronApp && typeof electronApp.getPath === 'function'
            ? electronApp.getPath('userData')
            : process.cwd();
      } catch {
        baseDir = process.cwd();
      }
    }

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    this.queue = customDir ? new SqlitePrintQueue(customDir) : sqliteQueue;
    this.tokenStore = customDir ? new SecureTokenStorage(customDir) : secureTokenStorage;

    this.filePath = path.join(baseDir, 'mozz_printer_preferences.json');
    this.preferences = {
      settings: { ...DEFAULT_SETTINGS },
    };
    this.loadPreferences(baseDir);
    this.initializeDefaultPrintersIfEmpty();
  }

  private loadPreferences(baseDir: string): void {
    try {
      // Check for legacy JSON store to migrate legacy data safely
      const legacyPath = path.join(baseDir, 'mozz_printer_store.json');
      if (fs.existsSync(legacyPath)) {
        try {
          const rawLegacy = fs.readFileSync(legacyPath, 'utf-8');
          const parsed = JSON.parse(rawLegacy);

          // 1. Migrate plain token to safeStorage and wipe from JSON
          if (parsed.deviceToken && typeof parsed.deviceToken === 'string') {
            console.log('[Storage] Migrating legacy plaintext token to OS encrypted safeStorage...');
            secureTokenStorage.storeDeviceToken(parsed.deviceToken);
            delete parsed.deviceToken;
          }

          // 2. Migrate legacy jobs to SQLite
          if (parsed.jobs && typeof parsed.jobs === 'object') {
            for (const job of Object.values(parsed.jobs) as PrintJob[]) {
              sqliteQueue.saveJob(job);
            }
          }

          // 3. Migrate legacy printer configs to SQLite
          if (Array.isArray(parsed.printerConfigs) && parsed.printerConfigs.length > 0) {
            for (const cfg of parsed.printerConfigs) {
              sqliteQueue.savePrinterConfig(cfg);
            }
          }

          if (parsed.settings) {
            this.preferences.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
          }

          // Wipe old unencrypted file
          fs.unlinkSync(legacyPath);
          this.savePreferencesSync();
          return;
        } catch (mErr) {
          console.error('[Storage] Error during legacy migration:', mErr);
        }
      }

      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const storedApiUrl =
          typeof parsed.settings?.apiUrl === 'string' && parsed.settings.apiUrl.trim()
            ? parsed.settings.apiUrl.trim().replace(/\/+$/, '')
            : RESOLVED_DEFAULT_API_URL;
        this.preferences = {
          settings: {
            ...DEFAULT_SETTINGS,
            ...(parsed.settings || {}),
            apiUrl: storedApiUrl,
          },
        };
      } else {
        this.savePreferencesSync();
      }
    } catch (err) {
      console.error('[Storage] Error loading preferences, initializing defaults:', err);
      this.savePreferencesSync();
    }
  }

  private initializeDefaultPrintersIfEmpty(): void {
    const existing = sqliteQueue.getPrinterConfigs();
    if (existing.length === 0) {
      for (const cfg of DEFAULT_PRINTER_CONFIGS) {
        sqliteQueue.savePrinterConfig(cfg);
      }
    }
  }

  private savePreferencesSync(): void {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.preferences, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('[Storage] Error saving preferences synchronously:', err);
    }
  }

  // ==========================================
  // SETTINGS & METADATA (NO RAW TOKENS EXPOSED)
  // ==========================================

  public getSettings(): AppSettings {
    return {
      ...this.preferences.settings,
      hasToken: this.tokenStore.hasDeviceToken(),
      maskedToken: this.tokenStore.getMaskedToken(),
    };
  }

  public saveSettings(newSettings: Partial<AppSettings>): AppSettings {
    // Strip any inadvertent token from settings object to guarantee tokens are never exposed in renderer variables or plaintext settings
    const cleanSettings = { ...newSettings };
    delete (cleanSettings as any).deviceToken;
    delete (cleanSettings as any).token;

    if (typeof cleanSettings.apiUrl === 'string') {
      cleanSettings.apiUrl = cleanSettings.apiUrl.trim().replace(/\/+$/, '');
    }

    this.preferences.settings = { ...this.preferences.settings, ...cleanSettings };
    this.savePreferencesSync();
    return this.getSettings();
  }

  // ==========================================
  // SECURE DEVICE TOKEN (SAFE STORAGE ONLY)
  // ==========================================

  /**
   * Only the Electron main process may read the decrypted device token.
   * Never exposed to IPC or React renderer.
   */
  public getDeviceToken(): string | null {
    return this.tokenStore.getDeviceToken();
  }

  public setDeviceToken(token: string | null): void {
    if (token) {
      this.tokenStore.storeDeviceToken(token);
    } else {
      this.tokenStore.clearDeviceToken();
    }
  }

  // ==========================================
  // PRINTER CONFIGS (SQLITE)
  // ==========================================

  public getPrinterConfigs(): PrinterConfig[] {
    return this.queue.getPrinterConfigs();
  }

  public getStationPrinter(station: PrinterStation | string): PrinterConfig | undefined {
    return this.queue.getStationPrinter(station) || this.getPrinterConfigs()[0];
  }

  public savePrinterConfig(config: PrinterConfig): void {
    this.queue.savePrinterConfig(config);
  }

  // ==========================================
  // JOBS & IDEMPOTENCY QUEUE (SQLITE)
  // ==========================================

  public isJobCompleted(jobId: string, idempotencyKey?: string): boolean {
    return this.queue.isJobCompleted(jobId, idempotencyKey);
  }

  public markJobCompleted(jobId: string): void {
    this.queue.markJobCompleted(jobId);
  }

  public saveJob(job: PrintJob): void {
    this.queue.saveJob(job);
  }

  public getJob(jobId: string): PrintJob | undefined {
    return this.queue.getJob(jobId);
  }

  public updateJob(jobId: string, updates: Partial<PrintJob>): PrintJob | undefined {
    return this.queue.updateJob(jobId, updates);
  }

  public getPendingJobs(): PrintJob[] {
    return this.queue.getPendingJobs();
  }

  public getFailedJobs(): PrintJob[] {
    return this.queue.getFailedJobs();
  }

  public getJobHistory(limit = 100): PrintJob[] {
    return this.queue.getJobHistory(limit);
  }

  public clearCompletedJobs(): number {
    return this.queue.clearCompletedJobs();
  }

  // ==========================================
  // ATTEMPT SPOOL LOGS (SQLITE)
  // ==========================================

  public logAttempt(log: PrintAttemptLog): void {
    this.queue.logAttempt(log);
  }

  public getAttemptLogs(limit = 200): PrintAttemptLog[] {
    return this.queue.getAttemptLogs(limit);
  }
}

export const localStore = new LocalStorageManager();
