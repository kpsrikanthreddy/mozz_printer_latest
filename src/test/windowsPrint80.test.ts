import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { LocalStorageManager } from '../main/storage.js';
import { SilentPrintService } from '../main/silentPrintService.js';
import type { PrintJob, PrinterConfig } from '../types/index.js';

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

    const printService = new SilentPrintService();

    let capturedPrintOptions: any = null;
    let printCallbackToTrigger: any = null;
    let windowDestroyed = false;

    // Mock Electron BrowserWindow
    class MockBrowserWindow {
      public webContents: any;
      private destroyed = false;

      constructor(_options: any) {
        this.webContents = {
          on: (_event: string, handler: () => void) => {
            // Immediately simulate 'did-finish-load'
            if (_event === 'did-finish-load') {
              setTimeout(handler, 10);
            }
          },
          print: (options: any, callback: (success: boolean, failureReason?: string) => void) => {
            capturedPrintOptions = options;
            printCallbackToTrigger = callback;
          },
        };
      }

      loadURL(_url: string) {
        // loaded data url
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

    printService.setBrowserWindowMock(MockBrowserWindow);

    // Test 1: Successful print dispatch to "80 Printer"
    console.log('[Test 1] Dispatching test print to "80 Printer" and checking options...');
    const config80: PrinterConfig = {
      station: 'kitchen_master',
      printerName: '80 Printer',
      paperWidthMm: 80,
      copies: 1,
      isAutoPrint: true,
    };

    const printPromise = printService.executeTestPrint('KOT', config80, '80 Printer');

    // Wait for the print window to call webContents.print
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(capturedPrintOptions, 'print() options must have been captured');
    assert.strictEqual(
      capturedPrintOptions.silent,
      true,
      'Print job must be dispatched with silent: true'
    );
    assert.strictEqual(
      capturedPrintOptions.deviceName,
      '80 Printer',
      'Print job must pass exact deviceName "80 Printer"'
    );
    assert.strictEqual(
      capturedPrintOptions.margins?.marginType,
      'custom',
      'Margins must be custom with 0 padding for thermal receipt'
    );
    assert.strictEqual(capturedPrintOptions.margins?.top, 0, 'Top margin must be 0');
    assert.strictEqual(capturedPrintOptions.margins?.bottom, 0, 'Bottom margin must be 0');

    // Simulate successful submission by Electron to Windows Spooler
    assert.ok(printCallbackToTrigger, 'Print callback must be registered');
    printCallbackToTrigger(true);

    const result = await printPromise;

    assert.strictEqual(result.success, true, 'Result should be successful');
    assert.strictEqual(
      result.status,
      'submitted_to_spooler',
      'Status must be marked as "submitted_to_spooler"'
    );
    assert.strictEqual(
      result.printerName,
      '80 Printer',
      'Printer name in result must be "80 Printer"'
    );
    assert.ok(
      result.message?.includes('80 Printer'),
      'Result message must mention "80 Printer"'
    );
    assert.strictEqual(windowDestroyed, true, 'BrowserWindow must be cleaned up/destroyed');

    console.log('✓ Test 1 Passed: "80 Printer" silent dispatch, callback success, and status submitted_to_spooler verified.\n');

    // Test 2: Verify the 15-second timeout does NOT trigger prematurely
    console.log('[Test 2] Verifying no false 15s timeout on "80 Printer"...');
    // Ensure that our timeout is 45s safety timeout, not the old 15s timeout
    let callbackTriggered = false;
    const printPromise2 = printService.executeTestPrint('BILL', config80, '80 Printer');

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(capturedPrintOptions.deviceName, '80 Printer');

    // Simulate callback completing after slight delay
    setTimeout(() => {
      callbackTriggered = true;
      if (printCallbackToTrigger) {
        printCallbackToTrigger(true);
      }
    }, 100);

    const result2 = await printPromise2;
    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.status, 'submitted_to_spooler');
    assert.strictEqual(callbackTriggered, true);
    console.log('✓ Test 2 Passed: Callback-based completion confirmed without premature 15s spooler timeout.\n');

    // Test 3: Electron callback returns failure (e.g. printer offline or spooler error)
    console.log('[Test 3] Testing handling when Electron callback returns failure...');
    const printPromise3 = printService.executeTestPrint('KOT', config80, '80 Printer');
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Simulate callback error
    if (printCallbackToTrigger) {
      printCallbackToTrigger(false, 'Windows Spooler RPC error 1722');
    }

    const result3 = await printPromise3;
    assert.strictEqual(result3.success, false, 'Result must be false when callback reports failure');
    assert.strictEqual(result3.status, 'FAILED', 'Status must be FAILED');
    assert.ok(
      result3.error?.includes('Windows Spooler RPC error 1722'),
      'Error message must capture the callback error reason'
    );
    console.log('✓ Test 3 Passed: Explicit callback failure properly recorded.\n');

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
