import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
} from 'electron';
import fs from 'fs';
import path from 'path';

import {
  initProcessErrorHandlers,
  attachWebContentsDiagnostics,
  logMain,
  showFatalErrorDialog,
  getMainLogPath,
} from './diagnostics.js';

// 1. Register process.on('uncaughtException'), process.on('unhandledRejection') BEFORE initializing storage
initProcessErrorHandlers();

// Standardize backend configuration in Electron main process:
// Prioritizes MOZZ_API_URL, then STARTERS4U_API_URL.
// Defaults to https://www.starters4u.in in production and http://localhost:3000 only in local development.
if (!process.env.MOZZ_API_URL && !process.env.STARTERS4U_API_URL) {
  process.env.MOZZ_API_URL =
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://www.starters4u.in';
}

// 2. Initialize SQLite storage and display error dialog if it fails instead of silently exiting
import { initStorage, localStore } from './storage.js';
import { printerManager } from './printerManager.js';
import { silentPrintService } from './silentPrintService.js';
import { agentClient } from './sseClient.js';
import type {
  AppSettings,
  PrinterConfig,
  PrintJobType,
  PrinterStation,
  PaperWidthMm,
  AgentMetrics,
} from '../types/index.js';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let readyToShowReached = false;
const startTimeMs = Date.now();

// Packaged-app smoke test detection
const isSmokeTest =
  process.argv.includes('--smoke-test') || process.env.MOZZ_SMOKE_TEST === '1';

if (isSmokeTest) {
  logMain('INFO', '*** SMOKE TEST MODE ACTIVATED ***');
  try {
    app.disableHardwareAcceleration();
  } catch {
    // ignore
  }

  // Safety timer for CI smoke test
  const smokeTimer = setTimeout(() => {
    logMain('FATAL', 'SMOKE TEST TIMEOUT: Main window failed to reach ready-to-show within 30 seconds');
    showFatalErrorDialog(
      'Mozz Print Agent - Smoke Test Timeout',
      'Main window failed to reach ready-to-show within 30 seconds.'
    );
    process.exit(1);
  }, 30000);
  smokeTimer.unref();
}

logMain('INFO', 'Initializing local SQLite database and preferences storage...');
const storageInit = initStorage();
if (storageInit.error || !storageInit.store.isReady()) {
  const err =
    storageInit.error ||
    storageInit.store.getInitError() ||
    new Error('SQLite database failed to open or verify schema.');
  logMain('FATAL', 'SQLite initialization failed during startup', err);
  if (!isSmokeTest) {
    showFatalErrorDialog(
      'Mozz Print Agent - Database Initialization Error',
      `Failed to initialize local SQLite database required for thermal print spooling and job idempotency:\n\n${err.message}`,
      err
    );
  }
  process.exitCode = 1;
  app.exit(1);
} else {
  logMain('INFO', 'Local SQLite storage verified and ready.');
}

function createMainWindow(): BrowserWindow {
  logMain('INFO', 'Creating main application BrowserWindow...');
  const win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    title: 'Mozz Print Agent - Starters4U POS',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Attach render-process-gone and did-fail-load handlers
  attachWebContentsDiagnostics(win, 'Main POS Window');

  // Load UI: dev server in development, built index.html in production
  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    logMain('INFO', `Loading Vite dev server URL: ${process.env.VITE_DEV_SERVER_URL}`);
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const rendererPath = path.join(__dirname, '../renderer/index.html');
    logMain('INFO', `Loading production renderer file: ${rendererPath}`);
    if (!fs.existsSync(rendererPath)) {
      const missingErr = new Error(`Production renderer index.html missing at ${rendererPath}`);
      logMain('FATAL', missingErr.message);
      showFatalErrorDialog(
        'Mozz Print Agent - Missing UI Files',
        `The user interface bundle was not found at:\n${rendererPath}\n\nPlease rebuild or reinstall the application.`,
        missingErr
      );
    }
    win.loadFile(rendererPath);
  }

  win.once('ready-to-show', () => {
    readyToShowReached = true;
    logMain('INFO', 'Main window reached ready-to-show state.');
    if (!isSmokeTest) {
      win.show();
    } else {
      logMain('INFO', '[SMOKE TEST] ready-to-show confirmed! Exiting with code 0.');
      console.log('SMOKE_TEST_SUCCESS: Main window reached ready-to-show.');
      setTimeout(() => {
        app.exit(0);
      }, 500);
    }
  });

  win.on('close', (event: any) => {
    const settings = localStore.getSettings();
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault();
      win.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'Mozz Print Agent',
          content: 'Agent is continuing to run in the background to handle thermal print jobs.',
        });
      }
    }
  });

  return win;
}

function createTray() {
  if (tray) return;

  // Simple 16x16 tray icon pixel buffer fallback
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVR42mNkQAO/gZgBiBkYGBj+M6CBAwMT1DYGLgZ8AB2A2DCaoAHiw+yG6UChB2AZhhkAMYyBYQwMAw48hhmATg/DYBiAhmEwDCAMg2EGQBjGMAzDYBhA2DCGYQYMQDgEAK17Q5eU5U/0AAAAAElFTkSuQmCC',
      'base64'
    )
  );

  tray = new Tray(icon);
  tray.setToolTip('Mozz Print Agent - Starters4U');

  const updateContextMenu = () => {
    const status = agentClient.getStatus();
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Mozz Print Agent',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: `Status: ${status.replace('_', ' ').toUpperCase()}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Test KOT Print (Kitchen)',
        click: async () => {
          const config = localStore.getStationPrinter('kitchen_master');
          if (config) {
            await silentPrintService.executeTestPrint('KOT', config);
          }
        },
      },
      {
        label: 'Test Bill Print (Counter)',
        click: async () => {
          const config = localStore.getStationPrinter('billing');
          if (config) {
            await silentPrintService.executeTestPrint('BILL', config);
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Exit Agent',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(contextMenu);
  };

  updateContextMenu();
  agentClient.onStatus(() => updateContextMenu());

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function setupIpcHandlers() {
  // 1. Settings & Connection
  ipcMain.handle('get-settings', () => {
    return localStore.getSettings();
  });

  ipcMain.handle('save-settings', (_event: any, newSettings: Partial<AppSettings>) => {
    const prevSettings = localStore.getSettings();
    const updated = localStore.saveSettings(newSettings);

    // Reconnect SSE/polling services if API URL was updated while registered
    if (newSettings.apiUrl && newSettings.apiUrl !== prevSettings.apiUrl && updated.isRegistered) {
      console.log(`[Main] API URL updated from ${prevSettings.apiUrl} to ${newSettings.apiUrl}. Reconnecting agent client...`);
      agentClient.stop();
      agentClient.start();
    }

    // Update Windows auto-start setting
    if (typeof newSettings.autoStartOnBoot === 'boolean') {
      try {
        app.setLoginItemSettings({
          openAtLogin: newSettings.autoStartOnBoot,
          name: 'Mozz Print Agent',
        });
      } catch (err) {
        console.warn('[AutoLaunch] Could not set Windows login item:', err);
      }
    }

    return updated;
  });

  ipcMain.handle('get-connection-status', () => {
    return agentClient.getStatus();
  });

  ipcMain.handle('get-metrics', (): AgentMetrics => {
    const history = localStore.getJobHistory(1000);
    const printed = history.filter((j) => j.status === 'PRINTED').length;
    const failed = history.filter((j) => j.status === 'FAILED').length;
    const pending = localStore.getPendingJobs().length;

    return {
      totalJobsReceived: history.length,
      totalJobsPrinted: printed,
      totalJobsFailed: failed,
      pendingQueueLength: pending,
      connectionUptimeSeconds: Math.floor((Date.now() - startTimeMs) / 1000),
      lastSyncTime: localStore.getSettings().lastHeartbeatAt,
    };
  });

  // 2. Device Registration
  ipcMain.handle(
    'register-device',
    async (
      _event: any,
      payload: {
        apiUrl: string;
        restaurantId: string;
        branchId: string;
        deviceId: string;
        deviceName: string;
      }
    ) => {
      try {
        const cleanUrl = payload.apiUrl.replace(/\/$/, '');
        const res = await fetch(`${cleanUrl}/api/print-agent/register-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantId: payload.restaurantId,
            branchId: payload.branchId,
            deviceId: payload.deviceId,
            deviceName: payload.deviceName,
            platform: 'windows',
            appVersion: app.getVersion() || '1.0.0',
          }),
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as any;
          return { success: false, error: errBody?.error || `Registration failed with status ${res.status}` };
        }

        const data = (await res.json()) as any;
        const plainToken = data.deviceToken;

        // Store device token securely in local private store
        localStore.setDeviceToken(plainToken);
        localStore.saveSettings({
          apiUrl: cleanUrl,
          restaurantId: payload.restaurantId,
          branchId: payload.branchId,
          deviceId: payload.deviceId,
          deviceName: payload.deviceName,
          isRegistered: true,
        });

        // Restart client with active connection
        agentClient.connect();

        return { success: true, deviceName: payload.deviceName };
      } catch (err: any) {
        return { success: false, error: err.message || 'Connection error during device registration' };
      }
    }
  );

  // 2.1. Fast 6-Digit Pairing Code Exchange
  ipcMain.handle(
    'pair-device-with-code',
    async (
      _event: any,
      payload: {
        apiUrl: string;
        pairingCode: string;
        deviceId?: string;
        deviceName?: string;
      }
    ) => {
      try {
        const cleanUrl = payload.apiUrl.replace(/\/$/, '');
        const currentSettings = localStore.getSettings();
        const deviceId = payload.deviceId || currentSettings.deviceId || `win_pos_${Math.random().toString(36).substring(2, 10)}`;
        const deviceName = payload.deviceName || currentSettings.deviceName || 'Windows POS Terminal';

        const res = await fetch(`${cleanUrl}/api/print-agent/devices/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pairingCode: payload.pairingCode,
            deviceId,
            deviceName,
            platform: 'win32',
            appVersion: app.getVersion() || '1.0.0',
          }),
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as any;
          return { success: false, error: errBody?.error || `Pairing failed with status ${res.status}` };
        }

        const data = (await res.json()) as any;
        const plainToken = data.deviceToken;

        if (!plainToken) {
          return { success: false, error: 'Server did not issue a device token' };
        }

        // Store device token securely in local safeStorage (never returned to renderer)
        localStore.setDeviceToken(plainToken);
        localStore.saveSettings({
          apiUrl: cleanUrl,
          restaurantId: data.restaurant?.id || '',
          restaurantName: data.restaurant?.name || '',
          branchId: data.branch?.id || '',
          branchName: data.branch?.name || '',
          deviceId,
          deviceName,
          isRegistered: true,
        });

        // Start SSE stream
        agentClient.connect();

        return {
          success: true,
          deviceName,
          restaurantName: data.restaurant?.name,
          branchName: data.branch?.name,
        };
      } catch (err: any) {
        return { success: false, error: err.message || 'Connection error during device pairing' };
      }
    }
  );

  ipcMain.handle('disconnect-device', async () => {
    localStore.setDeviceToken(null);
    localStore.saveSettings({ isRegistered: false });
    agentClient.stop();
    return { success: true };
  });

  // 3. Hardware & Printers
  ipcMain.handle('get-available-printers', async () => {
    return printerManager.getAvailablePrinters(mainWindow);
  });

  ipcMain.handle('get-printer-configs', () => {
    return localStore.getPrinterConfigs();
  });

  ipcMain.handle('save-printer-config', (_event: any, config: PrinterConfig) => {
    localStore.savePrinterConfig(config);
    return { success: true };
  });

  ipcMain.handle(
    'test-print',
    async (
      _event: any,
      payload: {
        type: PrintJobType;
        station: PrinterStation;
        paperWidthMm: PaperWidthMm;
        customPrinterName?: string;
      }
    ) => {
      const config: PrinterConfig = {
        station: payload.station,
        printerName: payload.customPrinterName || 'MOCK_PRINTER',
        paperWidthMm: payload.paperWidthMm,
        copies: 1,
        isAutoPrint: true,
      };
      return silentPrintService.executeTestPrint(payload.type, config, payload.customPrinterName);
    }
  );

  // 4. Jobs & Queue
  ipcMain.handle('get-pending-jobs', () => {
    return localStore.getPendingJobs();
  });

  ipcMain.handle('get-failed-jobs', () => {
    return localStore.getFailedJobs();
  });

  ipcMain.handle('get-job-history', (_event: any, limit?: number) => {
    return localStore.getJobHistory(limit);
  });

  ipcMain.handle('retry-job', async (_event: any, jobId: string) => {
    const job = localStore.getJob(jobId);
    if (!job) return { success: false, error: 'Job not found in local store' };
    if (job.isTest || job.id.startsWith('TEST-')) {
      const config = localStore.getStationPrinter(job.station);
      const res = await silentPrintService.executeJob(job, config?.printerName, config?.paperWidthMm);
      if (res.success) {
        localStore.markJobCompleted(job.id);
      }
      return { success: res.success, error: res.error };
    }
    const ok = await agentClient.processIncomingJob(job, true);
    return { success: ok, error: ok ? undefined : 'Retry failed' };
  });

  ipcMain.handle('reprint-job', async (_event: any, jobId: string, station?: string) => {
    const originalJob = localStore.getJob(jobId);
    if (!originalJob) return { success: false, error: 'Original job not found' };

    const isTestJob = Boolean(originalJob.isTest || originalJob.id.startsWith('TEST-'));
    const reprintJob = {
      ...originalJob,
      id: isTestJob ? `TEST-${Date.now()}` : `${originalJob.id}_reprint_${Date.now()}`,
      isTest: isTestJob ? true : originalJob.isTest,
      station: station || originalJob.station,
      isReprint: true,
      payload: {
        ...originalJob.payload,
        isTest: isTestJob ? true : (originalJob.payload as any)?.isTest,
        isReprint: true,
      },
      status: 'PENDING' as const,
      createdAt: new Date().toISOString(),
    };

    if (isTestJob) {
      localStore.saveJob(reprintJob);
      const config = localStore.getStationPrinter(reprintJob.station);
      const res = await silentPrintService.executeJob(reprintJob, config?.printerName, config?.paperWidthMm);
      if (res.success) {
        localStore.markJobCompleted(reprintJob.id);
      }
      return { success: res.success, error: res.error };
    }

    const ok = await agentClient.processIncomingJob(reprintJob, true);
    return { success: ok, error: ok ? undefined : 'Reprint failed' };
  });

  ipcMain.handle('clear-completed-jobs', () => {
    const count = localStore.clearCompletedJobs();
    return { count };
  });

  ipcMain.handle('delete-job', (_event: any, jobId: string) => {
    const ok = localStore.deleteJob(jobId);
    return { success: ok };
  });

  ipcMain.handle('delete-jobs', (_event: any, jobIds: string[]) => {
    const count = localStore.deleteJobs(jobIds);
    return { count, success: true };
  });

  ipcMain.handle('cancel-job', async (_event: any, jobId: string, reason?: string) => {
    const ok = localStore.cancelJob(jobId, reason || 'Cancelled by operator');
    // Report cancellation to the backend only if the backend supports this operation
    const settings = localStore.getSettings();
    const token = localStore.getDeviceToken();
    if (token && settings.apiUrl) {
      try {
        const cleanUrl = settings.apiUrl.replace(/\/$/, '');
        await fetch(`${cleanUrl}/api/print-agent/jobs/${jobId}/cancel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: reason || 'Cancelled by operator on POS print agent' }),
        }).catch(() => {});
      } catch {
        // Silently catch - backend might not implement this endpoint
      }
    }
    return { success: ok };
  });

  // 5. App Window Control
  ipcMain.handle('open-external', (_event: any, url: string) => {
    shell.openExternal(url);
  });

  ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion() || '1.0.0';
  });
}

// Ensure single instance lock on Windows
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupIpcHandlers();
    mainWindow = createMainWindow();
    createTray();

    // Forward status and job events to renderer UI
    agentClient.onStatus((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('connection-status-changed', status);
      }
    });

    agentClient.onJob((event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('job-event', event);
      }
    });

    // Start client if already registered
    const settings = localStore.getSettings();
    if (settings.isRegistered && localStore.getDeviceToken()) {
      agentClient.start();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    agentClient.stop();
  });

  app.on('will-quit', () => {
    if (isSmokeTest && !readyToShowReached) {
      logMain('FATAL', 'Application exited prematurely before reaching ready-to-show.');
      process.exit(1);
    }
  });
}
