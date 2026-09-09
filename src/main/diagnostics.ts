import { app, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';

let cachedLogDir: string | null = null;

export function getLogDir(): string {
  if (cachedLogDir) return cachedLogDir;
  try {
    if (app && typeof app.getPath === 'function') {
      cachedLogDir = path.join(app.getPath('userData'), 'logs');
      return cachedLogDir;
    }
  } catch {
    // Outside electron or before path resolution
  }
  return path.join(process.cwd(), 'logs');
}

export function getMainLogPath(): string {
  return path.join(getLogDir(), 'main.log');
}

export function logMain(
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL',
  message: string,
  detail?: any
): void {
  try {
    const logDir = getLogDir();
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    let detailStr = '';
    if (detail !== undefined && detail !== null) {
      if (detail instanceof Error) {
        detailStr = `\n  Error: ${detail.message}${detail.stack ? `\n  Stack: ${detail.stack}` : ''}`;
      } else if (typeof detail === 'object') {
        try {
          detailStr = `\n  Details: ${JSON.stringify(detail, null, 2)}`;
        } catch {
          detailStr = `\n  Details: [Unserializable Object: ${String(detail)}]`;
        }
      } else {
        detailStr = `\n  Details: ${String(detail)}`;
      }
    }

    const logLine = `[${timestamp}] [${level}] ${message}${detailStr}\n`;
    fs.appendFileSync(getMainLogPath(), logLine, 'utf8');

    // Also mirror to console for developer visibility
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(`[${level}] ${message}`, detail || '');
    } else if (level === 'WARN') {
      console.warn(`[${level}] ${message}`, detail || '');
    } else {
      console.log(`[${level}] ${message}`, detail || '');
    }
  } catch (err) {
    console.error('[Diagnostics] Failed writing to main.log:', err);
  }
}

export function showFatalErrorDialog(title: string, message: string, detail?: any): void {
  const logFile = getMainLogPath();
  logMain('FATAL', `${title}: ${message}`, detail);

  let technicalMsg = '';
  if (detail instanceof Error) {
    technicalMsg = `\n\nTechnical Error:\n${detail.message}`;
  } else if (detail) {
    technicalMsg = `\n\nDetails:\n${typeof detail === 'object' ? JSON.stringify(detail) : String(detail)}`;
  }

  const dialogMessage = `${message}${technicalMsg}\n\nDiagnostic logs written to:\n${logFile}`;

  try {
    if (dialog && typeof dialog.showErrorBox === 'function') {
      dialog.showErrorBox(title, dialogMessage);
    } else {
      console.error(`[CRITICAL ERROR DIALOG] ${title}\n${dialogMessage}`);
    }
  } catch (dialogErr) {
    console.error(`[CRITICAL ERROR DIALOG FAILED] ${title}\n${dialogMessage}`, dialogErr);
  }
}

let handlersInitialized = false;

export function initProcessErrorHandlers(): void {
  if (handlersInitialized) return;
  handlersInitialized = true;

  logMain('INFO', '============================================================');
  logMain('INFO', '🚀 Mozz Print Agent Starting Up');
  logMain('INFO', `Process PID: ${process.pid}`);
  logMain('INFO', `Node.js: ${process.version}`);
  logMain('INFO', `Electron: ${process.versions?.electron || 'N/A'}`);
  logMain('INFO', `Chrome: ${process.versions?.chrome || 'N/A'}`);
  logMain('INFO', `Platform: ${process.platform} (${process.arch})`);
  try {
    if (app && typeof app.getPath === 'function') {
      logMain('INFO', `UserData Path: ${app.getPath('userData')}`);
      logMain('INFO', `App Path: ${app.getAppPath()}`);
    }
  } catch {
    // Ignored in test environment
  }
  logMain('INFO', `Log File: ${getMainLogPath()}`);
  logMain('INFO', '============================================================');

  // Register uncaughtException before any subsystem initializations
  process.on('uncaughtException', (error: Error) => {
    logMain('ERROR', 'Uncaught Exception detected in Electron main process', error);
    showFatalErrorDialog(
      'Mozz Print Agent - Uncaught Exception',
      'An unexpected critical exception occurred in the background main process.',
      error
    );
  });

  // Register unhandledRejection before any async subsystems
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logMain('ERROR', 'Unhandled Promise Rejection in Electron main process', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    const err = reason instanceof Error ? reason : new Error(String(reason));
    showFatalErrorDialog(
      'Mozz Print Agent - Unhandled Promise Rejection',
      'A background asynchronous operation failed without handling.',
      err
    );
  });

  // Global app-level render process gone fallback
  if (app && typeof app.on === 'function') {
    app.on('render-process-gone', (_event, webContents, details) => {
      const url = webContents.getURL();
      logMain(
        'ERROR',
        `App-level render-process-gone for URL: ${url || 'unknown'} (reason=${details.reason}, exitCode=${details.exitCode})`
      );
      showFatalErrorDialog(
        'Mozz Print Agent - UI Process Crashed',
        `A renderer window process terminated unexpectedly.\nReason: ${details.reason}\nExit Code: ${details.exitCode}`,
        details
      );
    });
  }
}

export function attachWebContentsDiagnostics(
  win: BrowserWindow,
  windowLabel = 'Main Window'
): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    logMain(
      'ERROR',
      `[${windowLabel}] render-process-gone: reason=${details.reason}, exitCode=${details.exitCode}`
    );
    showFatalErrorDialog(
      'Mozz Print Agent - Render Process Gone',
      `The ${windowLabel} user interface terminated unexpectedly.\nReason: ${details.reason}\nExit Code: ${details.exitCode}`,
      details
    );
  });

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // errorCode -3 is ERR_ABORTED, harmlessly triggered during normal client-side navigation/redirects
      if (errorCode === -3) {
        logMain(
          'INFO',
          `[${windowLabel}] did-fail-load: ERR_ABORTED (-3) ignored for ${validatedURL}`
        );
        return;
      }

      const errMsg = `[${windowLabel}] Failed to load: [${errorCode}] ${errorDescription} at ${validatedURL} (isMainFrame=${isMainFrame})`;
      logMain('ERROR', errMsg);
      showFatalErrorDialog(
        'Mozz Print Agent - Renderer Load Failure',
        `Failed to load the user interface.\n\nURL: ${validatedURL}\nError Code: ${errorCode}\nDescription: ${errorDescription}`,
        new Error(errMsg)
      );
    }
  );

  win.webContents.on('unresponsive', () => {
    logMain('WARN', `[${windowLabel}] WebContents became unresponsive`);
  });

  win.webContents.on('responsive', () => {
    logMain('INFO', `[${windowLabel}] WebContents became responsive again`);
  });
}
