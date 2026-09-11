import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { generateKotHtml, generateBillHtml } from '../main/ticketTemplates.js';
import { silentPrintService } from '../main/silentPrintService.js';
import { localStore } from '../main/storage.js';
import { agentClient } from '../main/sseClient.js';
import type { PrintJob, KotTicketPayload, BillTicketPayload, PrinterConfig } from '../types/index.js';

async function runProductionSafetyTests() {
  console.log('\n============================================================');
  console.log('🛡️ RUNNING PRODUCTION SAFETY VERIFICATION TEST SUITE');
  console.log('============================================================\n');

  // -------------------------------------------------------------------------
  // 1. VERIFY REMOVAL OF SIMULATED/DEMO ORDERS IN CODEBASE
  // -------------------------------------------------------------------------
  console.log('▶ [Safety Test 1] Simulated Orders & Demo Data Removal');

  const browserApiPath = path.resolve(process.cwd(), 'src/renderer/src/browserApi.ts');
  const browserApiContent = fs.readFileSync(browserApiPath, 'utf-8');

  // Check 1.1: INITIAL_JOBS must be completely empty
  assert.ok(
    browserApiContent.includes('export const INITIAL_JOBS: PrintJob[] = [];') ||
    browserApiContent.includes('const INITIAL_JOBS: PrintJob[] = [];'),
    'INITIAL_JOBS must be empty in browserApi.ts'
  );
  assert.strictEqual(
    browserApiContent.includes('ORD-101') || browserApiContent.includes('STARTERS4U'),
    false,
    'browserApi.ts must not contain any hardcoded demo/mock customer orders'
  );
  console.log('  ✔ INITIAL_JOBS is strictly empty (0 initial jobs in browserApi.ts)');

  // Check 1.2: BrowserPrintAgentStore must not have simulateIncomingOrder
  assert.strictEqual(
    browserApiContent.includes('simulateIncomingOrder'),
    false,
    'browserApi.ts must NOT contain simulateIncomingOrder method'
  );
  console.log('  ✔ BrowserPrintAgentStore.simulateIncomingOrder is removed');

  // Check 1.3: window.mozzPrinterSimulateOrder must not exist
  assert.strictEqual(
    browserApiContent.includes('mozzPrinterSimulateOrder'),
    false,
    'browserApi.ts must NOT reference mozzPrinterSimulateOrder'
  );
  const appPath = path.resolve(process.cwd(), 'src/renderer/src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');
  assert.strictEqual(
    appContent.includes('mozzPrinterSimulateOrder'),
    false,
    'App.tsx must NOT reference mozzPrinterSimulateOrder'
  );
  assert.strictEqual(
    appContent.includes('onSimulateOrder'),
    false,
    'App.tsx must NOT pass onSimulateOrder'
  );
  const headerPath = path.resolve(process.cwd(), 'src/renderer/src/components/Header.tsx');
  const headerContent = fs.readFileSync(headerPath, 'utf-8');
  assert.strictEqual(
    headerContent.includes('onSimulateOrder'),
    false,
    'Header.tsx must NOT have onSimulateOrder'
  );
  assert.strictEqual(
    headerContent.includes('Simulate Order'),
    false,
    'Header.tsx must NOT render "Simulate Order" button'
  );
  console.log('  ✔ window.mozzPrinterSimulateOrder and Simulate Order buttons are completely eliminated');

  // Check 1.4: Environment check message in App.tsx
  assert.ok(
    appContent.includes('Mozz Print Agent must be opened from the installed Windows application.'),
    'App.tsx must display "Mozz Print Agent must be opened from the installed Windows application." outside Electron'
  );
  console.log('  ✔ Environment check verified in App.tsx');
  console.log('  ✔ [Safety Test 1 Passed] Production cannot generate simulated orders.\n');

  // -------------------------------------------------------------------------
  // 2. VERIFY TEST PRINT BANNER & PAYLOAD ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log('▶ [Safety Test 2] Test Print Banner & Payload Structure');

  const testTimestamp = Date.now();
  const testKotPayload: KotTicketPayload = {
    isTest: true,
    restaurantName: 'Starters4U Test Kitchen',
    branchName: 'Madhapur Outlet',
    kotNumber: `KOT-TEST-${testTimestamp}`,
    orderNumber: `TEST-${testTimestamp}`,
    orderType: 'Test Print Drill',
    tableNumber: 'TEST-01',
    station: 'kitchen_master',
    orderTime: new Date().toISOString(),
    items: [
      { name: 'Diagnostic Test Item', quantity: 1, specialInstructions: 'Diagnostic spool run' }
    ],
  };

  const kotHtml = generateKotHtml(testKotPayload, 80);
  assert.ok(
    kotHtml.includes('*** TEST PRINT — NOT A CUSTOMER ORDER ***'),
    'KOT ticket template must clearly render "*** TEST PRINT — NOT A CUSTOMER ORDER ***" header'
  );
  console.log('  ✔ KOT ticket renders "*** TEST PRINT — NOT A CUSTOMER ORDER ***"');

  const testBillPayload: BillTicketPayload = {
    isTest: true,
    restaurantName: 'Starters4U Test Kitchen',
    branchName: 'Madhapur Outlet',
    branchAddress: 'Plot 42, Hitech City, Hyderabad',
    branchPhone: '+91 98765 43210',
    gstin: '36AAAAA0000A1Z5',
    billNumber: `BILL-TEST-${testTimestamp}`,
    orderNumber: `TEST-${testTimestamp}`,
    orderTime: new Date().toISOString(),
    orderType: 'Test Bill Receipt',
    tableNumber: 'TEST-01',
    customerName: 'Diagnostic Operator',
    customerPhone: '+91 98000 12345',
    items: [
      { name: 'Diagnostic Test Item', quantity: 1, unitPrice: 100, itemTotal: 100 }
    ],
    itemTotal: 100,
    discount: 0,
    tax: 5,
    taxRate: 5,
    deliveryFee: 0,
    grandTotal: 105,
    paymentMethod: 'TEST_DIAGNOSTIC',
    paymentStatus: 'PAID_TEST',
  };

  const billHtml = generateBillHtml(testBillPayload, 80);
  assert.ok(
    billHtml.includes('*** TEST PRINT — NOT A CUSTOMER ORDER ***'),
    'Bill ticket template must clearly render "*** TEST PRINT — NOT A CUSTOMER ORDER ***" header'
  );
  console.log('  ✔ Bill ticket renders "*** TEST PRINT — NOT A CUSTOMER ORDER ***"');

  // Check executeTestPrint output
  const testConfig: PrinterConfig = {
    station: 'kitchen_master',
    printerName: 'MOCK_PRINTER',
    paperWidthMm: 80,
    copies: 1,
    isAutoPrint: true,
  };
  const testPrintRes = await silentPrintService.executeTestPrint('KOT', testConfig, 'MOCK_PRINTER');
  assert.strictEqual(testPrintRes.success, true, 'Mock test print should succeed');

  // Verify created job in local store
  const history = localStore.getJobHistory(5);
  const createdTestJob = history.find((j) => j.id.startsWith('TEST-'));
  assert.ok(createdTestJob, 'Test job must be recorded in local queue with ID starting with TEST-');
  assert.strictEqual(createdTestJob.isTest, true, 'Created test job must have isTest: true');
  assert.ok(
    createdTestJob.orderNumber.startsWith('TEST-'),
    'Created test job must have orderNumber starting with TEST-'
  );
  console.log(`  ✔ Test print created local job ${createdTestJob.id} with isTest: true and orderNumber: ${createdTestJob.orderNumber}`);
  console.log('  ✔ [Safety Test 2 Passed] Test jobs properly flagged with visible banner and TEST- prefix.\n');

  // -------------------------------------------------------------------------
  // 3. VERIFY TEST JOBS NEVER COMMUNICATE WITH BACKEND API
  // -------------------------------------------------------------------------
  console.log('▶ [Safety Test 3] Strict Backend API Isolation for TEST-* Jobs');

  const originalFetch = globalThis.fetch;
  const outboundApiCalls: string[] = [];

  // Mock fetch to record any outbound API calls
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    outboundApiCalls.push(`${init?.method || 'GET'} ${url}`);
    return new Response(JSON.stringify({ success: true, status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;

  try {
    // Configure agent with active registered settings and device token
    localStore.saveSettings({
      apiUrl: 'https://backend.starters4u.com',
      restaurantId: 'rest_prod_01',
      branchId: 'branch_prod_01',
      isRegistered: true,
    });
    localStore.setDeviceToken('sec_token_prod_9988776655');

    // Test A: Process a TEST job (isTest: true, ID TEST-xxxx)
    const testJob: PrintJob = {
      id: `TEST-${Date.now()}`,
      isTest: true,
      restaurantId: 'rest_prod_01',
      branchId: 'branch_prod_01',
      orderId: `test_ord_${Date.now()}`,
      orderNumber: `TEST-${Date.now()}`,
      jobType: 'KOT',
      station: 'kitchen_master',
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      payload: testKotPayload,
    };

    outboundApiCalls.length = 0;
    const testProcessResult = await agentClient.processIncomingJob(testJob);
    assert.strictEqual(testProcessResult, true, 'Test job should process successfully locally');

    // CRITICAL: Verify NO backend API calls were made for test job!
    const testBackendCalls = outboundApiCalls.filter((c) =>
      c.includes('/claim') || c.includes('/status') || c.includes(testJob.id)
    );
    assert.strictEqual(
      testBackendCalls.length,
      0,
      `SECURITY VIOLATION: Test job triggered ${testBackendCalls.length} backend API calls: ${JSON.stringify(testBackendCalls)}`
    );
    console.log('  ✔ Processed test job: 0 backend API calls made (isolated to local workstation)');

    // Test B: Process a REAL customer order (isTest: false)
    const realCustomerJob: PrintJob = {
      id: `job_cust_${Date.now()}`,
      isTest: false,
      restaurantId: 'rest_prod_01',
      branchId: 'branch_prod_01',
      orderId: `ord_cust_${Date.now()}`,
      orderNumber: `S4U-9921`,
      jobType: 'KOT',
      station: 'kitchen_master',
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      payload: {
        restaurantName: 'Starters4U',
        branchName: 'Madhapur',
        kotNumber: 'KOT-882',
        orderNumber: 'S4U-9921',
        orderType: 'Dine In',
        tableNumber: 'T-03',
        station: 'kitchen_master',
        orderTime: new Date().toISOString(),
        items: [{ name: 'Paneer Makhani Pizza', quantity: 1 }],
      },
    };

    outboundApiCalls.length = 0;
    await agentClient.processIncomingJob(realCustomerJob);

    // Verify real customer order DOES contact the backend to claim & update status
    const realBackendCalls = outboundApiCalls.filter((c) =>
      c.includes('/claim') || c.includes('/status')
    );
    assert.ok(
      realBackendCalls.length > 0,
      'Real customer order should contact backend API to claim and report status'
    );
    console.log(`  ✔ Real customer order verified: ${realBackendCalls.length} backend API calls recorded`);

  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('  ✔ [Safety Test 3 Passed] isTest and TEST-* jobs are strictly prevented from sending backend API calls.\n');

  console.log('🎉 All Production Safety Tests Passed Successfully!\n');
}

runProductionSafetyTests().catch((err) => {
  console.error('❌ Production Safety Test Failed:', err);
  process.exit(1);
});
