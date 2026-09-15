import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { LocalStorageManager } from '../main/storage.js';
import {
  SilentPrintService,
  PrinterAdapter,
  PrintOptions,
  PrintBackendResult,
} from '../main/silentPrintService.js';
import type { PrinterConfig } from '../types/index.js';

async function removeDirWithRetry(dirPath: string, maxRetries = 5, retryDelayMs = 50): Promise<void> {
  if (!fs.existsSync(dirPath)) return;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (err: any) {
      if (attempt >= maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

/**
 * In-memory capture adapter implementing the PrinterAdapter interface.
 * Allows dependency injection for tests to verify dispatched options, HTML, and callbacks.
 */
class CapturePrinterAdapter implements PrinterAdapter {
  public capturedHtml: string | null = null;
  public capturedOptions: PrintOptions | null = null;
  public shouldSucceed = true;
  public failureReason?: string;

  async printHtml(html: string, options: PrintOptions): Promise<PrintBackendResult> {
    this.capturedHtml = html;
    this.capturedOptions = options;
    if (this.shouldSucceed) {
      return { success: true };
    } else {
      return {
        success: false,
        failureReason: this.failureReason || 'Windows Spooler RPC error 1722',
      };
    }
  }
}

async function runWindows80PrinterTests() {
  console.log('=== RUNNING WINDOWS "80 PRINTER" PRINT INTEGRATION TEST SUITE ===\n');

  const testStorageDir = path.join(process.cwd(), 'temp_test_storage_80print');
  if (fs.existsSync(testStorageDir)) {
    await removeDirWithRetry(testStorageDir);
  }

  let store: LocalStorageManager | null = null;

  try {
    store = new LocalStorageManager(testStorageDir);
    // Ensure mockPrintersEnabled is false to exercise the real Windows Electron print path
    store.saveSettings({
      restaurantId: 'rest_test_scantech',
      branchId: 'branch_scantech_01',
      mockPrintersEnabled: false,
    });

    const config80: PrinterConfig = {
      station: 'kitchen_master',
      printerName: '80 Printer',
      paperWidthMm: 80,
      copies: 1,
      isAutoPrint: true,
    };

    // -------------------------------------------------------------------------
    // TEST 1: Electron BrowserWindow & webContents.print Mocking (Callback Success)
    // -------------------------------------------------------------------------
    console.log('[Test 1] Mocking Electron webContents.print and verifying "80 Printer" options and callback success...');

    let capturedElectronOptions: any = null;
    let windowDestroyed = false;
    let mockPrintShouldSucceed = true;
    let mockPrintFailureReason: string | undefined = undefined;

    class MockBrowserWindow {
      public webContents: any;
      private destroyed = false;

      constructor(_options: any) {
        const listeners: { [event: string]: Function[] } = {};

        this.webContents = {
          on: (event: string, handler: Function) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
          },
          print: (options: any, callback: (success: boolean, failureReason?: string) => void) => {
            capturedElectronOptions = options;
            // Complete callback asynchronously on next tick to simulate Electron behavior
            queueMicrotask(() => {
              if (mockPrintShouldSucceed) {
                callback(true);
              } else {
                callback(false, mockPrintFailureReason || 'Windows Spooler RPC error 1722');
              }
            });
          },
        };

        // When loadURL is called, trigger did-finish-load on next tick
        (this as any)._triggerFinishLoad = () => {
          const handlers = listeners['did-finish-load'] || [];
          for (const h of handlers) {
            h();
          }
        };
      }

      loadURL(_url: string) {
        queueMicrotask(() => {
          (this as any)._triggerFinishLoad?.();
        });
      }

      destroy() {
        this.destroyed = true;
        windowDestroyed = true;
      }

      close() {
        this.destroyed = true;
        windowDestroyed = true;
      }

      isDestroyed() {
        return this.destroyed;
      }

      static getAllWindows() {
        return [];
      }
    }

    // Install mock before creating service or dispatching job
    const electronService = new SilentPrintService();
    electronService.setBrowserWindowMock(MockBrowserWindow);

    // Await complete async print-submission promise before asserting
    const result1 = await electronService.executeTestPrint('KOT', config80, '80 Printer');

    // Confirm production print options
    assert.ok(capturedElectronOptions, 'print() options must have been captured');
    assert.strictEqual(
      capturedElectronOptions.silent,
      true,
      'Print job must be dispatched with silent: true'
    );
    assert.strictEqual(
      capturedElectronOptions.deviceName,
      '80 Printer',
      'Print job must pass exact deviceName "80 Printer"'
    );
    assert.strictEqual(
      capturedElectronOptions.printBackground,
      true,
      'Print job must specify printBackground: true for ticket styling'
    );
    assert.strictEqual(
      capturedElectronOptions.margins?.marginType,
      'custom',
      'Margins must be custom with 0 padding for thermal receipt'
    );
    assert.strictEqual(capturedElectronOptions.margins?.top, 0, 'Top margin must be 0');
    assert.strictEqual(capturedElectronOptions.margins?.bottom, 0, 'Bottom margin must be 0');
    assert.strictEqual(capturedElectronOptions.margins?.left, 0, 'Left margin must be 0');
    assert.strictEqual(capturedElectronOptions.margins?.right, 0, 'Right margin must be 0');
    assert.strictEqual(capturedElectronOptions.pageSize, undefined, '80mm receipt should not force A4 pageSize');

    // Confirm status is submitted_to_spooler on callback success
    assert.strictEqual(result1.success, true, 'Result should be successful on callback success');
    assert.strictEqual(
      result1.status,
      'submitted_to_spooler',
      'Status must be marked as "submitted_to_spooler"'
    );
    assert.strictEqual(
      result1.printerName,
      '80 Printer',
      'Printer name in result must be "80 Printer"'
    );
    assert.strictEqual(windowDestroyed, true, 'BrowserWindow must be cleaned up/destroyed');

    console.log('✓ Test 1 Passed: Exact Electron print options captured, callback success verified, and status is submitted_to_spooler.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Electron print callback error -> status is failed
    // -------------------------------------------------------------------------
    console.log('[Test 2] Verifying Electron print callback error -> status is failed...');

    capturedElectronOptions = null;
    windowDestroyed = false;
    mockPrintShouldSucceed = false;
    mockPrintFailureReason = 'Windows Spooler RPC error 1722: The spooler service is not responding';

    const failResult = await electronService.executeTestPrint('BILL', config80, '80 Printer');

    assert.strictEqual(failResult.success, false, 'Result must be false on callback error');
    assert.strictEqual(
      failResult.status,
      'FAILED',
      'Status must be FAILED when callback returns error'
    );
    assert.ok(
      failResult.error?.includes('Windows Spooler RPC error 1722'),
      'Error message must capture the callback error reason'
    );
    assert.strictEqual(windowDestroyed, true, 'BrowserWindow must be cleaned up on failure');

    console.log('✓ Test 2 Passed: Electron print callback error properly mapped to status "FAILED".\n');

    // -------------------------------------------------------------------------
    // TEST 3: Dependency Injection via PrinterAdapter / PrintBackend Interface
    // -------------------------------------------------------------------------
    console.log('[Test 3] Verifying PrinterAdapter dependency injection (Success & Failure paths)...');

    const captureAdapter = new CapturePrinterAdapter();
    const diService = new SilentPrintService(captureAdapter);

    // 3a. Callback success -> status is submitted_to_spooler
    captureAdapter.shouldSucceed = true;
    const diSuccessResult = await diService.executeTestPrint('KOT', config80, '80 Printer');

    assert.ok(captureAdapter.capturedOptions, 'PrinterAdapter must have received PrintOptions');
    assert.strictEqual(captureAdapter.capturedOptions?.silent, true);
    assert.strictEqual(captureAdapter.capturedOptions?.deviceName, '80 Printer');
    assert.strictEqual(captureAdapter.capturedOptions?.printBackground, true);
    assert.strictEqual(captureAdapter.capturedOptions?.margins.marginType, 'custom');
    assert.strictEqual(captureAdapter.capturedOptions?.margins.top, 0);
    assert.strictEqual(captureAdapter.capturedOptions?.margins.bottom, 0);
    assert.strictEqual(captureAdapter.capturedOptions?.margins.left, 0);
    assert.strictEqual(captureAdapter.capturedOptions?.margins.right, 0);
    assert.strictEqual(diSuccessResult.success, true);
    assert.strictEqual(diSuccessResult.status, 'submitted_to_spooler');
    assert.strictEqual(diSuccessResult.printerName, '80 Printer');
    assert.ok(captureAdapter.capturedHtml?.includes('80mm') || captureAdapter.capturedHtml?.includes('KOT'), 'HTML payload should contain ticket data');

    // 3b. Callback error -> status is failed
    captureAdapter.shouldSucceed = false;
    captureAdapter.failureReason = 'Driver communication failed (Paper Out)';
    const diFailResult = await diService.executeTestPrint('BILL', config80, '80 Printer');

    assert.strictEqual(diFailResult.success, false);
    assert.strictEqual(diFailResult.status, 'FAILED');
    assert.ok(diFailResult.error?.includes('Driver communication failed (Paper Out)'));

    console.log('✓ Test 3 Passed: PrinterAdapter interface dependency injection confirmed for both success and failure.\n');

    // -------------------------------------------------------------------------
    // TEST 4: 80mm Thermal Page Size Configuration vs A4 Test Page
    // -------------------------------------------------------------------------
    console.log('[Test 4] Verifying 80mm thermal page configuration vs A4 Test mode...');

    // 80mm standard profile: should not set pageSize to A4
    captureAdapter.shouldSucceed = true;
    await diService.executeTestPrint('KOT', { ...config80, paperWidthMm: 80 }, '80 Printer');
    assert.strictEqual(captureAdapter.capturedOptions?.pageSize, undefined, '80mm should not set pageSize to A4');

    // A4_TEST profile: should set pageSize to A4
    await diService.executeTestPrint('KOT', { ...config80, paperWidthMm: 'A4_TEST' as any }, '80 Printer');
    assert.strictEqual(captureAdapter.capturedOptions?.pageSize, 'A4', 'A4_TEST profile must configure pageSize: "A4"');

    console.log('✓ Test 4 Passed: 80mm thermal receipt and A4 profile page sizes verified.\n');

  } finally {
    if (store) {
      store.close();
    }
    await removeDirWithRetry(testStorageDir);
  }

  console.log('=== ALL WINDOWS "80 PRINTER" INTEGRATION TESTS PASSED! ===\n');
}

runWindows80PrinterTests().catch((err) => {
  console.error('Windows 80 Printer integration test failed:', err);
  process.exit(1);
});

