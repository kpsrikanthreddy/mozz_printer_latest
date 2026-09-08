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
  durationMs: number;
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
    const printerName = explicitPrinterName || stationConfig?.printerName || 'MOCK_PRINTER';
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
    // Real hardware tests (e.g. Canon G3010 series, POS-80) MUST NOT be intercepted by mock mode.
    // Mock mode only applies when printerName is explicitly 'MOCK_PRINTER'.
    if (printerName === 'MOCK_PRINTER') {
      console.log(`[SilentPrint] [MOCK MODE] Simulating print for ${job.jobType} (${job.orderNumber}) to station: ${job.station}`);
      // Simulate real thermal spool delay (150ms)
      await new Promise((resolve) => setTimeout(resolve, 150));

      const durationMs = Date.now() - startTime;
      localStore.logAttempt({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        jobId: job.id,
        attemptNumber: (job.retryCount || 0) + 1,
        status: 'SUCCESS',
        printerName: 'MOCK_PRINTER',
        durationMs,
        timestamp: new Date().toISOString(),
      });

      localStore.saveJob({
        ...job,
        status: 'PRINTED',
        printedAt: new Date().toISOString(),
      });

      this.notifyJobEvent({ ...job, status: 'PRINTED', printedAt: new Date().toISOString() });

      return { success: true, durationMs };
    }

    // 4. Validate physical printer existence
    const isAvailable = await printerManager.isPrinterAvailable(printerName);
    if (!isAvailable) {
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

      localStore.saveJob({
        ...job,
        status: 'FAILED',
        failedAt: new Date().toISOString(),
        errorMessage: errorMsg,
      });

      this.notifyJobEvent({ ...job, status: 'FAILED', failedAt: new Date().toISOString(), errorMessage: errorMsg });

      return { success: false, error: errorMsg, durationMs };
    }

    // 4.1 Validate Windows Spooler health (check offline, paused, paper out)
    const spoolerHealth = await printerManager.checkPrinterSpoolerHealth(printerName);
    if (!spoolerHealth.isOnline) {
      const errorMsg = spoolerHealth.error || `[SPOOLER_ERROR] Printer "${printerName}" is offline, paused, or out of paper.`;
      console.error(`[SilentPrint] Hardware alert: ${errorMsg}`);
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

      localStore.saveJob({
        ...job,
        status: 'FAILED',
        failedAt: new Date().toISOString(),
        errorMessage: errorMsg,
      });

      this.notifyJobEvent({ ...job, status: 'FAILED', failedAt: new Date().toISOString(), errorMessage: errorMsg });

      return { success: false, error: errorMsg, durationMs };
    }

    // 5. Create offscreen background window for silent printing
    return new Promise((resolve) => {
      if (!ElectronBrowserWindow) {
        const errorMsg = 'Browser preview—physical printing unavailable. Physical printing must work only inside the packaged Electron desktop application.';
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
        localStore.saveJob({
          ...job,
          status: 'FAILED',
          failedAt: new Date().toISOString(),
          errorMessage: errorMsg,
        });
        resolve({ success: false, error: errorMsg, durationMs });
        return;
      }

      let printWindow: any = new ElectronBrowserWindow({
        show: false,
        width: 380,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const cleanup = () => {
        if (printWindow) {
          try {
            printWindow.close();
          } catch {
            // ignore
          }
          printWindow = null;
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        const durationMs = Date.now() - startTime;
        const timeoutError = `[TIMEOUT] Print timed out after 15s on printer "${printerName}". Windows Spooler did not acknowledge print.`;
        localStore.logAttempt({
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          jobId: job.id,
          attemptNumber: (job.retryCount || 0) + 1,
          status: 'FAILURE',
          printerName,
          errorMessage: timeoutError,
          durationMs,
          timestamp: new Date().toISOString(),
        });
        localStore.saveJob({
          ...job,
          status: 'FAILED',
          failedAt: new Date().toISOString(),
          errorMessage: timeoutError,
        });
        this.notifyJobEvent({ ...job, status: 'FAILED', failedAt: new Date().toISOString(), errorMessage: timeoutError });
        resolve({ success: false, error: timeoutError, durationMs });
      }, 15000);

      printWindow.webContents.on('did-finish-load', () => {
        if (!printWindow) return;

        const printOptions: any = {
          silent: true,
          printBackground: true,
          deviceName: printerName,
          copies,
        };

        // For A4 Test profile (e.g. Canon G3010), configure A4 page size and anchor margins to top-left
        if (paperWidthMm === 'A4_TEST') {
          printOptions.pageSize = 'A4';
          printOptions.margins = {
            marginType: 'custom',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          };
        }

        printWindow.webContents.print(
          printOptions,
          (success: boolean, failureReason?: string) => {
            clearTimeout(timeout);
            cleanup();

            const durationMs = Date.now() - startTime;
            if (success) {
              console.log(`[SilentPrint] Successfully printed job ${job.id} on "${printerName}" (${durationMs}ms)`);
              localStore.logAttempt({
                id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                jobId: job.id,
                attemptNumber: (job.retryCount || 0) + 1,
                status: 'SUCCESS',
                printerName,
                durationMs,
                timestamp: new Date().toISOString(),
              });
              localStore.saveJob({
                ...job,
                status: 'PRINTED',
                printedAt: new Date().toISOString(),
              });
              this.notifyJobEvent({ ...job, status: 'PRINTED', printedAt: new Date().toISOString() });
              resolve({ success: true, durationMs });
            } else {
              const errorMsg = `[ELECTRON_PRINT_FAILED] Windows print driver error: ${failureReason || 'webContents.print rejected dispatch'}`;
              console.error(`[SilentPrint] Failed printing job ${job.id} on "${printerName}": ${errorMsg}`);
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
              localStore.saveJob({
                ...job,
                status: 'FAILED',
                failedAt: new Date().toISOString(),
                errorMessage: errorMsg,
              });
              this.notifyJobEvent({ ...job, status: 'FAILED', failedAt: new Date().toISOString(), errorMessage: errorMsg });
              resolve({ success: false, error: errorMsg, durationMs });
            }
          }
        );
      });

      // Load HTML data URL into silent print window
      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(ticketHtml)}`);
    });
  }

  private notifyJobEvent(job: PrintJob) {
    try {
      if (ElectronBrowserWindow) {
        const windows = ElectronBrowserWindow.getAllWindows();
        for (const win of windows) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('job-event', {
              type: job.status === 'PRINTED' ? 'JOB_COMPLETED' : 'JOB_UPDATED',
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
    const mockJob: PrintJob = {
      id: `test_${testTimestamp}`,
      idempotencyKey: `test_idemp_${testTimestamp}`,
      restaurantId: 'test_rest',
      branchId: 'test_branch',
      orderId: 'test_order',
      orderNumber: 'TEST-101',
      jobType: type,
      station: config.station,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      payload:
        type === 'KOT'
          ? {
              restaurantName: 'Starters4U Test Kitchen',
              branchName: 'Main Store',
              kotNumber: 'KOT-TEST-01',
              orderNumber: 'TEST-101',
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
              restaurantName: 'Starters4U',
              branchName: 'Madhapur Branch, Hyderabad',
              branchAddress: 'Plot 42, Hitec City Main Rd',
              branchPhone: '+91 98765 43210',
              gstin: '36AAAAA0000A1Z5',
              billNumber: 'INV-TEST-2026-001',
              orderNumber: 'TEST-101',
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

    return this.executeJob(mockJob, customPrinterName || config.printerName, config.paperWidthMm);
  }
}

export const silentPrintService = new SilentPrintService();
