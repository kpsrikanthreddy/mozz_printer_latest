let ElectronBrowserWindow: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  if (typeof electron === 'object' && electron !== null) {
    ElectronBrowserWindow = electron.BrowserWindow;
  }
} catch {
  // outside electron runtime
}

import { localStore } from './storage.js';
import { printerManager } from './printerManager.js';
import { generateKotHtml, generateBillHtml } from './ticketTemplates.js';
import { logMain } from './diagnostics.js';
import type {
  PrintJob,
  KotTicketPayload,
  BillTicketPayload,
  PrinterConfig,
  PaperWidthMm,
} from '../types/index.js';

export interface PrintResult {
  success: boolean;
  error?: string;
  message?: string;
  durationMs: number;
  printerName?: string;
  status?: string;
}

export interface PrintOptions {
  silent: boolean;
  printBackground: boolean;
  deviceName: string;
  copies: number;
  margins: {
    marginType: string;
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  pageSize?: any;
}

export interface PrintBackendResult {
  success: boolean;
  failureReason?: string;
}

export interface PrinterAdapter {
  printHtml(
    html: string,
    options: PrintOptions
  ): Promise<PrintBackendResult>;
}

export class ElectronPrinterAdapter implements PrinterAdapter {
  private browserWindowClass: any;
  private timeoutMs: number;

  constructor(browserWindowClass?: any, timeoutMs = 45000) {
    this.browserWindowClass = browserWindowClass || ElectronBrowserWindow;
    this.timeoutMs = timeoutMs;
  }

  public setBrowserWindowClass(cls: any) {
    this.browserWindowClass = cls;
  }

  public getBrowserWindowClass(): any {
    return this.browserWindowClass || ElectronBrowserWindow;
  }

  public setTimeoutMs(ms: number) {
    this.timeoutMs = ms;
  }

  public async printHtml(
    html: string,
    options: PrintOptions
  ): Promise<PrintBackendResult> {
    const BW = this.getBrowserWindowClass();
    if (!BW) {
      return {
        success: false,
        failureReason:
          'Browser preview—physical printing unavailable. Physical printing must work only inside the packaged Electron desktop application.',
      };
    }

    let printWindow: any = null;
    let hasFinished = false;
    let pageLoaded = false;
    let documentReady = false;
    let printInvoked = false;
    let callbackReceived = false;

    const cleanup = () => {
      if (printWindow) {
        try {
          if (typeof printWindow.destroy === 'function' && !printWindow.isDestroyed?.()) {
            printWindow.destroy();
          } else if (typeof printWindow.close === 'function') {
            printWindow.close();
          }
        } catch {
          // ignore
        }
        printWindow = null;
      }
    };

    try {
      // Stage 1: Create hidden BrowserWindow
      printWindow = new BW({
        show: false,
        width: 380,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const stg1Log = `[SilentPrint] [STG-1] Print window created (hidden 380x800) for device: "${options.deviceName}"`;
      console.log(stg1Log);
      logMain('INFO', stg1Log, { deviceName: options.deviceName });

      // Listen for rendering failures if supported by webContents
      if (printWindow.webContents && typeof printWindow.webContents.on === 'function') {
        printWindow.webContents.on('did-fail-load', (_event: any, errorCode: number, errorDescription: string) => {
          console.error(`[SilentPrint] [STG-2-ERR] Ticket rendering failed: ${errorDescription} (${errorCode}) for "${options.deviceName}"`);
        });
      }

      // Stage 2: Load ticket HTML via data URL and explicitly await completion
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      console.log(`[SilentPrint] [STG-2] Loading ticket HTML via data URL for device: "${options.deviceName}"...`);

      const loadPromise = printWindow.loadURL(dataUrl);
      if (loadPromise && typeof loadPromise.then === 'function') {
        await loadPromise;
      }
      pageLoaded = true;

      const stg2Log = `[SilentPrint] [STG-2] Ticket HTML loaded successfully for device: "${options.deviceName}"`;
      console.log(stg2Log);
      logMain('INFO', stg2Log, { deviceName: options.deviceName });

      // Await document and fonts readiness if webContents supports executeJavaScript
      try {
        if (printWindow.webContents && typeof printWindow.webContents.executeJavaScript === 'function') {
          await printWindow.webContents.executeJavaScript(
            'document.fonts ? document.fonts.ready.then(() => document.readyState) : document.readyState',
            true
          );
        }
        documentReady = true;
      } catch {
        documentReady = true; // non-fatal fallback
      }

      // Stage 3 & 4: Call webContents.print exactly once, await callback or safety timeout
      return await new Promise<PrintBackendResult>((resolve) => {
        const timeoutMs = this.timeoutMs || 45000;
        const timeout = setTimeout(() => {
          if (hasFinished) return;
          hasFinished = true;
          cleanup();

          const diagStr = `[Diagnostics: pageLoaded=${pageLoaded}, documentReady=${documentReady}, printInvoked=${printInvoked}, callbackReceived=${callbackReceived} on "${options.deviceName}"]`;
          console.error(`[SilentPrint] [STG-TIMEOUT] Print call timed out after ${Math.round(timeoutMs / 1000)}s on printer "${options.deviceName}". ${diagStr}`);
          logMain('WARN', `Print call timed out on "${options.deviceName}"`, {
            deviceName: options.deviceName,
            diagnostics: { pageLoaded, documentReady, printInvoked, callbackReceived },
          });

          if (printInvoked && !callbackReceived) {
            resolve({
              success: false,
              failureReason: `Print request was submitted; Electron callback did not return. ${diagStr}`,
            });
          } else {
            resolve({
              success: false,
              failureReason: `[TIMEOUT] Print preparation timed out after ${Math.round(timeoutMs / 1000)}s on printer "${options.deviceName}". ${diagStr}`,
            });
          }
        }, timeoutMs);

        // Stage 3: Invoke webContents.print API
        printInvoked = true;
        const stg3Log = `[SilentPrint] [STG-3] Invoking webContents.print API for exact selected device: "${options.deviceName}"`;
        console.log(stg3Log);
        logMain('INFO', stg3Log, { deviceName: options.deviceName, options });

        try {
          printWindow.webContents.print(
            options,
            (success: boolean, failureReason?: string) => {
              if (hasFinished) return;
              hasFinished = true;
              clearTimeout(timeout);
              callbackReceived = true;

              const stg4Log = `[SilentPrint] [STG-4] Electron print callback received for "${options.deviceName}": success=${success}${failureReason ? `, failureReason="${failureReason}"` : ''}`;
              if (success) {
                console.log(stg4Log);
                logMain('INFO', stg4Log, { deviceName: options.deviceName });
              } else {
                console.error(stg4Log);
                logMain('ERROR', stg4Log, { deviceName: options.deviceName, failureReason });
              }

              cleanup();
              resolve({
                success,
                failureReason: success ? undefined : (failureReason || 'Electron print callback returned false'),
              });
            }
          );
        } catch (printErr: any) {
          if (hasFinished) return;
          hasFinished = true;
          clearTimeout(timeout);
          cleanup();
          const invokeErr = `[ELECTRON_INVOKE_ERROR] Failed to invoke webContents.print: ${printErr?.message || String(printErr)}`;
          console.error(`[SilentPrint] [STG-3-ERR] ${invokeErr}`);
          logMain('ERROR', invokeErr, { deviceName: options.deviceName, error: printErr });
          resolve({
            success: false,
            failureReason: invokeErr,
          });
        }
      });
    } catch (err: any) {
      cleanup();
      const failMsg = `[RENDER_FAILED] Failed to prepare ticket for print: ${err?.message || String(err)}`;
      console.error(`[SilentPrint] [ERR] ${failMsg}`);
      logMain('ERROR', failMsg, { deviceName: options.deviceName, error: err });
      return {
        success: false,
        failureReason: failMsg,
      };
    }
  }
}

/**
 * Silent Thermal Printing Service
 *
 * ARCHITECTURAL SPECIFICATION:
 * - This implementation uses Electron offscreen BrowserWindow HTML rendering dispatched
 *   through installed Windows printer drivers.
 * - It is NOT raw ESC/POS binary socket streaming.
 * - Prerequisites: The thermal printer (e.g. Epson TM-T82, POS-80, TVS RP-3200) MUST be installed
 *   and successfully tested with a Windows test page in "Devices and Printers".
 * - Applied Page Sizing: 80mm (~72mm printable width, 576 dots) or 58mm (~48mm printable width, 384 dots)
 *   HTML/CSS layout sizing is applied dynamically via ticketTemplates.ts.
 * - Confirmation Scope: Electron's successful print callback confirms submission to the Windows
 *   Print Spooler subsystem; it does not physically guarantee mechanical paper advancement or cutting.
 * - Error Detection: Windows Spooler states (printer offline, paper out, driver faults) are inspected
 *   prior to dispatch where the Windows subsystem makes that information available.
 */
export class SilentPrintService {
  private adapter: PrinterAdapter;

  constructor(adapter?: PrinterAdapter) {
    this.adapter = adapter || new ElectronPrinterAdapter();
  }

  public setPrinterAdapter(adapter: PrinterAdapter) {
    this.adapter = adapter;
  }

  public getPrinterAdapter(): PrinterAdapter {
    return this.adapter;
  }

  /**
   * Internal test hook to inject a mock BrowserWindow class for integration testing.
   */
  public setBrowserWindowMock(mockClass: any, timeoutMs?: number) {
    ElectronBrowserWindow = mockClass;
    if (this.adapter instanceof ElectronPrinterAdapter) {
      this.adapter.setBrowserWindowClass(mockClass);
      if (timeoutMs !== undefined) {
        this.adapter.setTimeoutMs(timeoutMs);
      }
    }
  }

  /**
   * Silently prints a job through Windows printer drivers using a background BrowserWindow.
   */
  public async executeJob(
    job: PrintJob,
    explicitPrinterName?: string,
    explicitPaperWidth?: PaperWidthMm
  ): Promise<PrintResult> {
    const startTime = Date.now();
    const settings = localStore.getSettings();

    // 1. Determine target station and printer configuration
    const stationConfig = localStore.getStationPrinter(job.station || (job.jobType === 'KOT' ? 'kitchen_master' : 'billing'));
    const printerName = explicitPrinterName || job.printerName || stationConfig?.printerName || 'POS-80-Series';
    const paperWidthMm: PaperWidthMm = explicitPaperWidth || stationConfig?.paperWidthMm || (job.jobType === 'KOT' ? 80 : 80);
    const copies = stationConfig?.copies || 1;

    // 2. Generate HTML ticket
    let ticketHtml = '';
    if (job.jobType === 'KOT') {
      ticketHtml = generateKotHtml(job.payload as KotTicketPayload, paperWidthMm);
    } else {
      ticketHtml = generateBillHtml(job.payload as BillTicketPayload, paperWidthMm);
    }

    // 3. Check for Mock Mode
    // Real hardware tests (e.g. Scantech 80 Printer, Canon G3010 series, POS-80) MUST NOT be intercepted by mock mode.
    // Mock mode only applies when printerName is explicitly 'MOCK_PRINTER'.
    if (printerName === 'MOCK_PRINTER') {
      console.log(`[SilentPrint] [MOCK MODE] Simulating print for ${job.jobType} (${job.orderNumber}) to station: ${job.station}`);
      // Simulate real thermal spool delay (150ms)
      await new Promise((resolve) => setTimeout(resolve, 150));

      const durationMs = Date.now() - startTime;
      const successMsg = 'Ticket sent to Windows spooler for MOCK_PRINTER.';
      localStore.logAttempt({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        jobId: job.id,
        attemptNumber: (job.retryCount || 0) + 1,
        status: 'SUCCESS',
        printerName: 'MOCK_PRINTER',
        durationMs,
        timestamp: new Date().toISOString(),
      });

      localStore.markJobCompleted(job.id, 'submitted_to_spooler');
      const updatedJob: PrintJob = {
        ...job,
        status: 'submitted_to_spooler',
        printedAt: new Date().toISOString(),
        printerName: 'MOCK_PRINTER',
        lastCallbackResult: successMsg,
      };
      localStore.saveJob(updatedJob);

      this.notifyJobEvent(updatedJob);

      return {
        success: true,
        message: successMsg,
        durationMs,
        printerName: 'MOCK_PRINTER',
        status: 'submitted_to_spooler',
      };
    }

    // 4. Validate physical printer existence
    const isAvailable = await printerManager.isPrinterAvailable(printerName);
    const lowerPrinterName = printerName.toLowerCase();
    if (!isAvailable && lowerPrinterName !== 'pos-80-series' && lowerPrinterName !== '80 printer') {
      const errorMsg = `[PRINTER_NOT_FOUND] Printer "${printerName}" was not found in Windows Spooler. Ensure Windows driver is installed in Devices & Printers.`;
      console.error(`[SilentPrint] ${errorMsg}`);
      const durationMs = Date.now() - startTime;

      localStore.logAttempt({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        jobId: job.id,
        attemptNumber: (job.retryCount || 0) + 1,
        status: 'FAILURE',
        printerName,
        errorMessage: errorMsg,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      const failedJob: PrintJob = {
        ...job,
        status: 'FAILED',
        failedAt: new Date().toISOString(),
        errorMessage: errorMsg,
        printerName,
        lastCallbackResult: errorMsg,
      };
      localStore.saveJob(failedJob);

      this.notifyJobEvent(failedJob);

      return {
        success: false,
        error: errorMsg,
        durationMs,
        printerName,
        status: 'FAILED',
      };
    }

    // 5. Dispatch print job through printer adapter with explicit 80mm thermal profile
    const printOptions: PrintOptions = {
      silent: true,
      printBackground: true,
      deviceName: printerName,
      copies: copies || 1,
      margins: {
        marginType: 'custom',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    };

    // Explicit page size configuration in Electron-supported microns
    if (paperWidthMm === 'A4_TEST') {
      printOptions.pageSize = 'A4';
    } else if (paperWidthMm === 58) {
      // 58mm = 58,000 microns
      printOptions.pageSize = { width: 58000, height: 297000 };
    } else {
      // 80mm thermal roll paper = 80,000 microns width
      printOptions.pageSize = { width: 80000, height: 297000 };
    }

    const printResult = await this.adapter.printHtml(ticketHtml, printOptions);
    const durationMs = Date.now() - startTime;

    if (printResult.success) {
      const successMsg = `Ticket sent to Windows spooler for ${printerName}.`;
      console.log(`[SilentPrint] ${successMsg} (${durationMs}ms) for job ${job.id}`);
      logMain('INFO', successMsg, { jobId: job.id, printerName, durationMs });

      localStore.logAttempt({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        jobId: job.id,
        attemptNumber: (job.retryCount || 0) + 1,
        status: 'SUCCESS',
        printerName,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      // Update status to submitted_to_spooler on successful dispatch
      localStore.markJobCompleted(job.id, 'submitted_to_spooler');

      const completedJob: PrintJob = {
        ...job,
        status: 'submitted_to_spooler',
        printedAt: new Date().toISOString(),
        printerName,
        lastCallbackResult: successMsg,
        errorMessage: undefined,
      };
      localStore.saveJob(completedJob);

      this.notifyJobEvent(completedJob);

      return {
        success: true,
        message: successMsg,
        durationMs,
        printerName,
        status: 'submitted_to_spooler',
      };
    } else {
      const failureReason = printResult.failureReason || 'Electron print callback returned false';
      const errorMsg = failureReason.startsWith('[') || failureReason.includes('Print request was submitted')
        ? failureReason
        : `[ELECTRON_PRINT_FAILED] ${failureReason}`;

      console.error(`[SilentPrint] Failed printing job ${job.id} on "${printerName}": ${errorMsg}`);
      logMain('ERROR', `Failed printing job ${job.id} on "${printerName}"`, {
        jobId: job.id,
        printerName,
        error: errorMsg,
        durationMs,
      });

      localStore.logAttempt({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        jobId: job.id,
        attemptNumber: (job.retryCount || 0) + 1,
        status: 'FAILURE',
        printerName,
        errorMessage: errorMsg,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      const failedJob: PrintJob = {
        ...job,
        status: 'FAILED',
        failedAt: new Date().toISOString(),
        errorMessage: errorMsg,
        printerName,
        lastCallbackResult: errorMsg,
      };
      localStore.saveJob(failedJob);

      this.notifyJobEvent(failedJob);

      return {
        success: false,
        error: errorMsg,
        durationMs,
        printerName,
        status: 'FAILED',
      };
    }
  }

  private notifyJobEvent(job: PrintJob) {
    try {
      if (ElectronBrowserWindow) {
        const windows = ElectronBrowserWindow.getAllWindows();
        for (const win of windows) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('job-event', {
              type:
                job.status === 'PRINTED' || job.status === 'submitted_to_spooler'
                  ? 'JOB_COMPLETED'
                  : 'JOB_UPDATED',
              job,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Executes a test print without a real order.
   */
  public async executeTestPrint(
    type: 'KOT' | 'BILL',
    config: PrinterConfig,
    customPrinterName?: string
  ): Promise<PrintResult> {
    const testTimestamp = Date.now();
    const testId = `TEST-${testTimestamp}`;
    const testOrderNum = `TEST-${testTimestamp}`;
    const targetPrinter = customPrinterName || config.printerName || 'POS-80-Series';
    const mockJob: PrintJob = {
      id: testId,
      isTest: true,
      idempotencyKey: `test_idemp_${testTimestamp}`,
      restaurantId: 'test_rest',
      branchId: 'test_branch',
      orderId: `test_order_${testTimestamp}`,
      orderNumber: testOrderNum,
      jobType: type,
      station: config.station,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      printerName: targetPrinter,
      payload:
        type === 'KOT'
          ? {
              isTest: true,
              restaurantName: 'Starters4U Test Kitchen',
              branchName: 'Main Store',
              kotNumber: `KOT-${testId}`,
              orderNumber: testOrderNum,
              orderType: 'dine_in',
              tableNumber: 'T-07',
              orderTime: new Date().toISOString(),
              station: config.station,
              items: [
                {
                  name: 'Classic Margherita Pocket Pizza',
                  quantity: 2,
                  selectedShape: 'Korean Rectangle',
                  selectedCrust: 'Pocket Crust',
                  spiceLevel: 'Medium',
                  addons: ['Extra Mozzarella'],
                  specialInstructions: 'Crispy crust please',
                },
                {
                  name: 'Crispy Peri Peri Fries',
                  quantity: 1,
                  addons: ['Cheese Dip'],
                },
              ],
            }
          : {
              isTest: true,
              restaurantName: 'Starters4U',
              branchName: 'Madhapur Branch, Hyderabad',
              branchAddress: 'Plot 42, Hitec City Main Rd',
              branchPhone: '+91 98765 43210',
              gstin: '36AAAAA0000A1Z5',
              billNumber: `INV-${testId}`,
              orderNumber: testOrderNum,
              orderTime: new Date().toISOString(),
              orderType: 'dine_in',
              tableNumber: 'T-07',
              customerName: 'Test Customer',
              customerPhone: '9876543210',
              items: [
                {
                  name: 'Classic Margherita Pocket Pizza',
                  quantity: 2,
                  unitPrice: 249,
                  itemTotal: 498,
                },
                {
                  name: 'Crispy Peri Peri Fries',
                  quantity: 1,
                  unitPrice: 129,
                  itemTotal: 129,
                },
              ],
              itemTotal: 627,
              discount: 50,
              tax: 28.85,
              taxRate: 5,
              deliveryFee: 0,
              grandTotal: 605.85,
              paymentMethod: 'UPI QR',
              paymentStatus: 'PAID',
            },
    };

    localStore.saveJob(mockJob);
    this.notifyJobEvent(mockJob);

    return this.executeJob(mockJob, targetPrinter, config.paperWidthMm);
  }
}

export const silentPrintService = new SilentPrintService();
