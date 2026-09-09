import fs from 'fs';
import path from 'path';
import assert from 'assert';
import {
  logMain,
  getMainLogPath,
  showFatalErrorDialog,
  initProcessErrorHandlers,
} from '../main/diagnostics.js';
import { LocalStorageManager, initStorage } from '../main/storage.js';

function removeDirWithRetry(dirPath: string, retries = 5, delayMs = 100): void {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
      return;
    } catch (err: any) {
      if (i === retries - 1) throw err;
      const start = Date.now();
      while (Date.now() - start < delayMs) {
        // busy-wait
      }
    }
  }
}

async function runDiagnosticsTests(): Promise<void> {
  console.log('🧪 Starting Startup Diagnostics and Error Handling Tests...');

  // Test 1: Log file creation and timestamp format
  const logPath = getMainLogPath();
  const testMessage = `Diagnostics test verification log: ${Date.now()}`;
  logMain('INFO', testMessage, { meta: 'test-run' });

  assert.ok(fs.existsSync(logPath), `Expected log file to exist at ${logPath}`);
  const logContent = fs.readFileSync(logPath, 'utf-8');
  assert.ok(logContent.includes(testMessage), 'Log file should contain the written message');
  assert.ok(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\] \[INFO\]/.test(logContent), 'Log should match ISO timestamp format');
  console.log('  ✅ Test 1 Passed: Timestamped logs written to main.log');

  // Test 2: Fatal error logging and dialog fallback
  const fatalMsg = `Fatal failure test: ${Date.now()}`;
  showFatalErrorDialog('Test Critical Title', fatalMsg, new Error('Simulated database breakdown'));
  const updatedLog = fs.readFileSync(logPath, 'utf-8');
  assert.ok(updatedLog.includes('[FATAL]'), 'Log should contain [FATAL] entry');
  assert.ok(updatedLog.includes('Simulated database breakdown'), 'Log should contain technical error details');
  console.log('  ✅ Test 2 Passed: showFatalErrorDialog writes FATAL level and technical details');

  // Test 3: Process error handler registration is idempotent
  initProcessErrorHandlers();
  initProcessErrorHandlers();
  console.log('  ✅ Test 3 Passed: initProcessErrorHandlers runs cleanly');

  // Test 4: LocalStorageManager isReady and close lifecycle
  const testDir = path.join(process.cwd(), `test_diagnostics_${Date.now()}`);
  let store: LocalStorageManager | null = null;
  try {
    store = new LocalStorageManager(testDir);
    assert.strictEqual(store.isReady(), true, 'Expected store.isReady() to be true for valid dir');
    assert.strictEqual(store.getInitError(), null, 'Expected store.getInitError() to be null');
    assert.ok(fs.existsSync(path.join(testDir, 'mozz_printer.sqlite')), 'SQLite database file should exist');
  } finally {
    if (store) {
      store.close();
    }
    removeDirWithRetry(testDir);
  }
  console.log('  ✅ Test 4 Passed: LocalStorageManager lifecycle, isReady, and clean closing verified');

  // Test 5: initStorage returns healthy manager
  const storageResult = initStorage();
  assert.strictEqual(storageResult.error, null, 'initStorage() should not return an error');
  assert.ok(storageResult.store.isReady(), 'store should be ready');
  console.log('  ✅ Test 5 Passed: initStorage successfully initialises ready store');

  console.log('🎉 All Diagnostics and Startup Tests Passed!\n');
}

runDiagnosticsTests().catch((err) => {
  console.error('❌ Diagnostics Test Failed:', err);
  process.exit(1);
});
