import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { SecureTokenStorage } from '../main/secureStorage.js';
import { SqlitePrintQueue } from '../main/sqliteQueue.js';
import { calculateReconnectDelay } from '../main/sseClient.js';
import { LocalStorageManager } from '../main/storage.js';
import type { PrintJob } from '../types/index.js';

async function runStage3VerificationTests() {
  console.log('\n============================================================');
  console.log('🧪 RUNNING STAGE 3 CORRECTIVE VERIFICATION TEST SUITE');
  console.log('============================================================\n');

  const testTempDir = path.join(process.cwd(), 'temp_stage3_test_run');
  if (fs.existsSync(testTempDir)) {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testTempDir, { recursive: true });

  // -------------------------------------------------------------------------
  // 1. SECURE DEVICE TOKEN STORAGE TESTS
  // -------------------------------------------------------------------------
  console.log('▶ [Test 1] Secure Device-Token Storage Tests');
  const secureStorage = new SecureTokenStorage(testTempDir);
  const samplePlainToken = 'mozz_dev_tok_99887766554433221100aabbccddeeff';

  assert.strictEqual(secureStorage.hasDeviceToken(), false, 'Initially should have no token');
  assert.strictEqual(secureStorage.getDeviceToken(), null, 'Initially getDeviceToken should return null');

  // Store token
  secureStorage.storeDeviceToken(samplePlainToken);
  assert.strictEqual(secureStorage.hasDeviceToken(), true, 'hasDeviceToken must be true after storing');
  assert.strictEqual(secureStorage.getDeviceToken(), samplePlainToken, 'Decrypted token must equal plain token');

  // CRITICAL REQUIREMENT: Verify stored disk file does NOT contain the plain token!
  const storageFilePath = (secureStorage as any).tokenFilePath;
  assert.ok(fs.existsSync(storageFilePath), 'Storage file must exist on disk');
  const diskContent = fs.readFileSync(storageFilePath, 'utf-8');
  assert.strictEqual(
    diskContent.includes(samplePlainToken),
    false,
    'SECURITY CHECK FAILED: Stored file must NEVER contain plain token!'
  );
  assert.ok(
    diskContent.includes('iv') && diskContent.includes('tag') && diskContent.includes('payload'),
    'Stored file must contain ciphertext payload'
  );

  // Masked token test
  const masked = secureStorage.getMaskedToken();
  assert.ok(masked && masked.startsWith('••••'), 'Masked token should hide sensitive prefixes');
  assert.strictEqual(masked.includes(samplePlainToken), false, 'Masked token must not equal plain token');

  // Clear token (logout / device deactivation)
  secureStorage.clearDeviceToken();
  assert.strictEqual(secureStorage.hasDeviceToken(), false, 'hasDeviceToken must be false after clearing');
  assert.strictEqual(secureStorage.getDeviceToken(), null, 'getDeviceToken must be null after clearing');

  console.log('  ✔ [Test 1 Passed] Safe storage encryption, non-plaintext disk verification, and deactivation verified.\n');

  // -------------------------------------------------------------------------
  // 2. SQLITE PRINT QUEUE & UNCERTAIN_RECOVERY TESTS
  // -------------------------------------------------------------------------
  console.log('▶ [Test 2] SQLite Print Queue & Crash Recovery Tests');
  let queue = new SqlitePrintQueue(testTempDir);

  const sampleJob1: PrintJob = {
    id: 'job_test_001',
    restaurantId: 'rest_01',
    branchId: 'branch_01',
    orderId: 'order_101',
    orderNumber: 'ORD-101',
    jobType: 'KOT',
    station: 'kitchen_master',
    status: 'CLAIMED',
    retryCount: 0,
    idempotencyKey: 'idem_key_order_101_kot',
    createdAt: new Date().toISOString(),
    payload: {
      restaurantName: 'Starters4U Test',
      branchName: 'Madhapur',
      kotNumber: 'KOT-101',
      orderNumber: 'ORD-101',
      orderType: 'dine_in',
      orderTime: new Date().toISOString(),
      station: 'kitchen_master',
      items: [{ name: 'Pocket Pizza', quantity: 1 }],
    },
  };

  const sampleJob2: PrintJob = {
    id: 'job_test_002',
    restaurantId: 'rest_01',
    branchId: 'branch_01',
    orderId: 'order_102',
    orderNumber: 'ORD-102',
    jobType: 'BILL',
    station: 'billing',
    status: 'PRINTING',
    retryCount: 0,
    idempotencyKey: 'idem_key_order_102_bill',
    createdAt: new Date().toISOString(),
    payload: {
      restaurantName: 'Starters4U Test',
      branchName: 'Madhapur',
      billNumber: 'BILL-102',
      orderNumber: 'ORD-102',
      orderTime: new Date().toISOString(),
      orderType: 'dine_in',
      items: [{ name: 'Pocket Pizza', quantity: 1, unitPrice: 200, itemTotal: 200 }],
      itemTotal: 200,
      discount: 0,
      tax: 10,
      deliveryFee: 0,
      grandTotal: 210,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
    },
  };

  // Save jobs in in-flight states (CLAIMED and PRINTING)
  queue.saveJob(sampleJob1);
  queue.saveJob(sampleJob2);

  // Verify jobs in database
  assert.strictEqual(queue.getJob('job_test_001')?.status, 'CLAIMED');
  assert.strictEqual(queue.getJob('job_test_002')?.status, 'PRINTING');

  // SIMULATE CRASH & RESTART:
  // Close the database connection, re-instantiate, and run crash recovery!
  queue.close();
  queue = new SqlitePrintQueue(testTempDir);

  // CRITICAL USER DIRECTIVE:
  // "Do not automatically reprint an uncertain job without clearly marking and handling its state."
  // Startup crash recovery must transition in-flight CLAIMED / PRINTING jobs to UNCERTAIN_RECOVERY!
  const recoveredJob1 = queue.getJob('job_test_001');
  const recoveredJob2 = queue.getJob('job_test_002');

  assert.strictEqual(
    recoveredJob1?.status,
    'UNCERTAIN_RECOVERY',
    'In-flight CLAIMED jobs MUST transition to UNCERTAIN_RECOVERY upon startup'
  );
  assert.strictEqual(
    recoveredJob2?.status,
    'UNCERTAIN_RECOVERY',
    'In-flight PRINTING jobs MUST transition to UNCERTAIN_RECOVERY upon startup'
  );
  assert.ok(
    recoveredJob1?.errorMessage?.includes('Interrupted'),
    'Error message must indicate crash recovery was applied'
  );

  // Idempotency check with idempotencyKey
  assert.strictEqual(
    queue.isJobCompleted('job_test_001', 'idem_key_order_101_kot'),
    false,
    'Uncertain job is not marked completed'
  );
  queue.markJobCompleted('job_test_001');
  assert.strictEqual(
    queue.isJobCompleted('job_test_001', 'idem_key_order_101_kot'),
    true,
    'Job must be marked completed locally'
  );

  // Attempt spool logging in SQLite
  queue.logAttempt({
    id: 'att_001',
    jobId: 'job_test_001',
    attemptNumber: 1,
    status: 'SUCCESS',
    printerName: 'MOCK_PRINTER',
    durationMs: 140,
    timestamp: new Date().toISOString(),
  });
  const attempts = queue.getAttemptLogs('job_test_001');
  assert.strictEqual(attempts.length, 1);
  assert.strictEqual(attempts[0].status, 'SUCCESS');

  queue.close();
  console.log('  ✔ [Test 2 Passed] SQLite queue, crash recovery to UNCERTAIN_RECOVERY, and attempt logs verified.\n');

  // -------------------------------------------------------------------------
  // 3. SCALABLE RECONNECTION & BACKOFF DELAY TESTS
  // -------------------------------------------------------------------------
  console.log('▶ [Test 3] Scalable Exponential Backoff & Jitter Tests');
  const d0 = calculateReconnectDelay(0);
  const d1 = calculateReconnectDelay(1);
  const d2 = calculateReconnectDelay(2);
  const d3 = calculateReconnectDelay(3);
  const d10 = calculateReconnectDelay(10);

  assert.strictEqual(d0, 500, 'Attempt 0 must be 500ms immediate reconnection');
  assert.strictEqual(d1, 1500, 'Attempt 1 must be 1500ms');
  assert.strictEqual(d2, 3000, 'Attempt 2 must be 3000ms');
  assert.ok(d3 >= 4800, 'Attempt 3 must grow exponentially with base ~4800ms');
  assert.ok(d10 <= 30000, 'Attempt 10 must be capped at 30,000ms max delay');

  console.log(`  Calculated delays: [0]=${d0}ms, [1]=${d1}ms, [2]=${d2}ms, [3]=${d3}ms, [10]=${d10}ms`);
  console.log('  ✔ [Test 3 Passed] Exponential backoff with jitter calculation verified.\n');

  // Clean up test sandbox
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  console.log('============================================================');
  console.log('🎉 ALL STAGE 3 CORRECTIVE TESTS PASSED SUCCESSFULLY!');
  console.log('============================================================\n');
}

runStage3VerificationTests().catch((err) => {
  console.error('❌ Stage 3 Test Failure:', err);
  process.exit(1);
});
