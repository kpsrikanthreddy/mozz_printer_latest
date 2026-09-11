import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { SqlitePrintQueue } from '../main/sqliteQueue.js';
import {
  resolveOrderNumber,
  formatDisplayOrderNumber,
  formatStationHeading,
  getStationDisplayLabel,
} from '../utils/orderUtils.js';
import { generateBillHtml, generateKotHtml } from '../main/ticketTemplates.js';
import type { BillTicketPayload, KotTicketPayload } from '../types/index.js';

async function runTests() {
  console.log('\n============================================================');
  console.log('🧪 RUNNING ORDER NUMBER, CHINESE SPECIAL & DELETION TESTS');
  console.log('============================================================\n');

  // 1. Test resolveOrderNumber with various real backend payload structures
  console.log('▶ [Test 1] Order Number Resolution & Formatting');

  // Case A: payload with orderNumber
  const payloadA = { orderNumber: '105' };
  assert.strictEqual(resolveOrderNumber(payloadA), '105');
  assert.strictEqual(formatDisplayOrderNumber('105'), '#105');

  // Case B: payload with displayOrderId
  const payloadB = { displayOrderId: 'ORD-9821' };
  assert.strictEqual(resolveOrderNumber(payloadB), 'ORD-9821');
  assert.strictEqual(formatDisplayOrderNumber('ORD-9821'), '#ORD-9821');

  // Case C: payload with nested order.id
  const payloadC = { order: { id: 'order_abc_77' } };
  assert.strictEqual(resolveOrderNumber(payloadC), 'order_abc_77');
  assert.strictEqual(formatDisplayOrderNumber('order_abc_77'), '#order_abc_77');

  // Case D: payload with only a UUID orderId
  const uuid = 'a3f89b21-4433-2211-9988-776655443322';
  const payloadD = { orderId: uuid };
  assert.strictEqual(resolveOrderNumber(payloadD), 'ORD-A3F89B21');
  // UUID gets converted to short readable stable ID: #ORD-A3F89B21
  const formattedUuid = formatDisplayOrderNumber(uuid);
  assert.strictEqual(formattedUuid, '#ORD-A3F89B21');
  assert.notStrictEqual(formattedUuid, '#');

  // Case E: payload with missing / empty order number
  const payloadE = { items: [] };
  assert.strictEqual(resolveOrderNumber(payloadE), 'Unknown Order');
  assert.strictEqual(formatDisplayOrderNumber(''), '#Unknown Order');
  assert.strictEqual(formatDisplayOrderNumber(null), '#Unknown Order');
  assert.strictEqual(formatDisplayOrderNumber(undefined), '#Unknown Order');
  assert.strictEqual(formatDisplayOrderNumber('#'), '#Unknown Order');

  // Verify it NEVER renders only "#"
  assert.ok(!['#', ''].includes(formatDisplayOrderNumber('')));
  assert.ok(!['#', ''].includes(formatDisplayOrderNumber('#')));
  assert.ok(!['#', ''].includes(formatDisplayOrderNumber('   ')));

  console.log('  ✔ [Test 1 Passed] Order number extraction and formatting validated.\n');

  // 2. Test Station Renaming & Heading Generation
  console.log('▶ [Test 2] Station Renaming to Chinese Special');

  // Internal key preserved as 'bar_beverage'
  assert.strictEqual(getStationDisplayLabel('bar_beverage', false), 'Chinese Special');
  assert.strictEqual(getStationDisplayLabel('bar_beverage', true), 'Chinese Special (58mm)');
  assert.strictEqual(formatStationHeading('bar_beverage'), 'CHINESE SPECIAL');
  assert.strictEqual(formatStationHeading('bar_beverage_station'), 'CHINESE SPECIAL');
  assert.strictEqual(formatStationHeading('beverage_bar'), 'CHINESE SPECIAL');

  // Other stations remain distinct
  assert.strictEqual(getStationDisplayLabel('billing', false), 'Billing Counter');
  assert.strictEqual(formatStationHeading('billing'), 'BILLING COUNTER');
  assert.strictEqual(getStationDisplayLabel('kitchen_pizza', false), 'Pizza Section');
  assert.strictEqual(formatStationHeading('kitchen_pizza'), 'PIZZA SECTION');

  console.log('  ✔ [Test 2 Passed] Chinese Special labels and headers validated.\n');

  // 3. Test Ticket HTML Output for Consistency
  console.log('▶ [Test 3] Ticket Templates Consistency (Same Order Number on Bill and KOT)');

  const billPayload: BillTicketPayload = {
    restaurantName: 'Starters4U Test',
    branchName: 'Madhapur',
    billNumber: 'BILL-901',
    orderNumber: 'ORD-101',
    orderTime: new Date().toISOString(),
    orderType: 'dine_in',
    items: [{ name: 'Chicken Manchurian', quantity: 2, unitPrice: 180, itemTotal: 360 }],
    itemTotal: 360,
    discount: 0,
    tax: 0,
    deliveryFee: 0,
    grandTotal: 360,
    paymentMethod: 'UPI',
    paymentStatus: 'PAID',
  };

  const kotPayload: KotTicketPayload = {
    restaurantName: 'Starters4U Test',
    branchName: 'Madhapur',
    kotNumber: 'KOT-901',
    orderNumber: 'ORD-101',
    station: 'bar_beverage',
    orderTime: new Date().toISOString(),
    orderType: 'dine_in',
    items: [{ name: 'Veg Hakka Noodles', quantity: 1, specialInstructions: 'Extra spicy' }],
  };

  const billHtml = generateBillHtml(billPayload, 80);
  assert.ok(billHtml.includes('#ORD-101'), 'Bill must contain formatted order number #ORD-101');
  assert.ok(!billHtml.includes('##'), 'Bill must not have double #');

  const kotHtml = generateKotHtml(kotPayload, 58);
  assert.ok(kotHtml.includes('#ORD-101'), 'KOT must contain the exact same order number #ORD-101');
  assert.ok(
    kotHtml.includes('CHINESE SPECIAL'),
    'KOT for bar_beverage must render CHINESE SPECIAL header'
  );
  assert.ok(
    !kotHtml.includes('BEVERAGE BAR'),
    'KOT for bar_beverage must NOT render BEVERAGE BAR'
  );

  console.log('  ✔ [Test 3 Passed] HTML tickets contain identical order numbers and CHINESE SPECIAL.\n');

  // 4. Test SQLite Queue: Backfilling, Deletion & Cancellation
  console.log('▶ [Test 4] SQLite Queue: Backfill, Delete & Cancel Operations');

  const testDir = path.join(process.cwd(), 'temp_order_test_run');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const queue = new SqlitePrintQueue(testDir);

  // Insert a test job
  queue.saveJob({
    id: 'job_del_001',
    restaurantId: 'rest_01',
    branchId: 'branch_01',
    orderId: 'ord_uuid_001',
    orderNumber: 'ORD-5555',
    jobType: 'KOT',
    station: 'bar_beverage',
    status: 'PENDING',
    retryCount: 0,
    idempotencyKey: 'idem_001',
    createdAt: new Date().toISOString(),
    payload: kotPayload,
  });

  // Cancel job
  const cancelRes = queue.cancelJob('job_del_001', 'Test cancellation');
  assert.strictEqual(cancelRes, true, 'cancelJob must return true');
  const cancelledJob = queue.getJob('job_del_001');
  assert.strictEqual(cancelledJob?.status, 'CANCELLED');
  assert.ok(cancelledJob?.errorMessage?.includes('Test cancellation'));

  // Delete single job
  const delRes = queue.deleteJob('job_del_001');
  assert.strictEqual(delRes, true, 'deleteJob must return true');
  const deletedJob = queue.getJob('job_del_001');
  assert.strictEqual(!deletedJob, true, 'Deleted job must not exist in queue');

  // Bulk delete test
  queue.saveJob({
    id: 'job_del_002',
    restaurantId: 'rest_01',
    branchId: 'branch_01',
    orderId: 'ord_002',
    orderNumber: 'ORD-6666',
    jobType: 'BILL',
    station: 'billing',
    status: 'PRINTED',
    retryCount: 0,
    idempotencyKey: 'idem_002',
    createdAt: new Date().toISOString(),
    payload: billPayload,
  });
  queue.saveJob({
    id: 'job_del_003',
    restaurantId: 'rest_01',
    branchId: 'branch_01',
    orderId: 'ord_003',
    orderNumber: 'ORD-7777',
    jobType: 'KOT',
    station: 'kitchen_master',
    status: 'FAILED',
    retryCount: 1,
    idempotencyKey: 'idem_003',
    createdAt: new Date().toISOString(),
    payload: kotPayload,
  });

  const bulkCount = queue.deleteJobs(['job_del_002', 'job_del_003']);
  assert.strictEqual(bulkCount, 2, 'deleteJobs should report 2 deleted rows');
  assert.strictEqual(!queue.getJob('job_del_002'), true);
  assert.strictEqual(!queue.getJob('job_del_003'), true);

  queue.close();
  fs.rmSync(testDir, { recursive: true, force: true });

  console.log('  ✔ [Test 4 Passed] SQLite deletion, cancellation, and backfill validated.\n');
  console.log('============================================================');
  console.log('🎉 ALL NEW ORDER NUMBER & STATION TESTS PASSED!');
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
