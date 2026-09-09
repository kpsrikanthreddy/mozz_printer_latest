import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { LocalStorageManager } from '../main/storage.js';
import { generateKotHtml, generateBillHtml } from '../main/ticketTemplates.js';
import { SilentPrintService } from '../main/silentPrintService.js';
import type { KotTicketPayload, BillTicketPayload, PrinterConfig } from '../types/index.js';

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

async function runDesktopAgentTests() {
  console.log('=== RUNNING MOZZ PRINT AGENT (STAGE 3) TEST SUITE ===\n');

  const testStorageDir = path.join(process.cwd(), 'temp_test_storage');
  if (fs.existsSync(testStorageDir)) {
    await removeDirWithRetry(testStorageDir);
  }

  let store: LocalStorageManager | null = null;
  let reloadedStore: LocalStorageManager | null = null;

  try {
    // Test 1: Local Storage Idempotency & Persistence
    console.log('[Test 1] Testing Local Storage and Duplicate Print Prevention...');
    store = new LocalStorageManager(testStorageDir);
    const initialSettings = store.getSettings();
    assert.ok(initialSettings, 'Settings should load default values');

    store.saveSettings({
      restaurantId: 'rest_test_01',
      branchId: 'branch_madhapur_01',
      mockPrintersEnabled: true,
    });

    const updatedSettings = store.getSettings();
    assert.strictEqual(updatedSettings.restaurantId, 'rest_test_01', 'Restaurant ID must persist');
    assert.strictEqual(updatedSettings.mockPrintersEnabled, true, 'Mock mode setting must persist');

    // Verify printer configurations
    const testConfig: PrinterConfig = {
      station: 'kitchen_pizza',
      printerName: 'MOCK_PRINTER',
      paperWidthMm: 58,
      copies: 2,
      isAutoPrint: true,
    };
    store.savePrinterConfig(testConfig);
    const retrievedConfig = store.getStationPrinter('kitchen_pizza');
    assert.strictEqual(retrievedConfig?.paperWidthMm, 58, 'Station paper width must persist');
    assert.strictEqual(retrievedConfig?.copies, 2, 'Station copies count must persist');

    // Test Idempotency & Duplicate prevention
    const sampleJobId = 'job_uuid_9999';
    assert.strictEqual(store.isJobCompleted(sampleJobId), false, 'New job must not be marked completed');
    store.markJobCompleted(sampleJobId);
    assert.strictEqual(store.isJobCompleted(sampleJobId), true, 'Job must be marked completed');

    // Simulate App Restart (Re-instantiating store with existing directory)
    reloadedStore = new LocalStorageManager(testStorageDir);
    assert.strictEqual(
      reloadedStore.isJobCompleted(sampleJobId),
      true,
      'Job completion MUST persist across agent restarts to prevent duplicate tickets!'
    );
    console.log('✓ Test 1 Passed: Local persistence & duplicate prevention verified.\n');

    // Test 2: Thermal KOT Ticket Generation
  console.log('[Test 2] Testing Thermal KOT Ticket Generation (58mm & 80mm)...');
  const kotPayload: KotTicketPayload = {
    restaurantName: 'Starters4U Test Kitchen',
    branchName: 'Madhapur',
    kotNumber: 'KOT-2026-042',
    orderNumber: 'ORD-8821',
    orderType: 'dine_in',
    tableNumber: 'T-14',
    orderTime: new Date().toISOString(),
    station: 'kitchen_master',
    items: [
      {
        name: 'Classic Margherita Pocket Pizza',
        quantity: 2,
        selectedShape: 'Korean Rectangle',
        selectedCrust: 'Pocket Crust',
        spiceLevel: 'Medium',
        addons: ['Extra Mozzarella'],
        specialInstructions: 'Make it extra crisp',
      },
      {
        name: 'Crispy Peri Peri Fries',
        quantity: 1,
        addons: ['Chili Mayo Dip'],
      },
    ],
    specialInstructions: 'Urgent table, please expedite',
  };

  const kotHtml80 = generateKotHtml(kotPayload, 80);
  assert.ok(kotHtml80.includes('KOT-2026-042'), 'KOT number must be present');
  assert.ok(kotHtml80.includes('TABLE: T-14'), 'Table number must be highlighted');
  assert.ok(kotHtml80.includes('Korean Rectangle'), 'Custom pocket pizza shape must be present');
  assert.ok(kotHtml80.includes('Make it extra crisp'), 'Item instructions must be present');
  assert.ok(kotHtml80.includes('270px'), '80mm ticket must use 270px width constraint');

  const kotHtml58 = generateKotHtml(kotPayload, 58);
  assert.ok(kotHtml58.includes('190px'), '58mm ticket must use 190px width constraint');
  console.log('✓ Test 2 Passed: Thermal KOT HTML generation verified.\n');

  // Test 3: Thermal Bill Ticket Generation
  console.log('[Test 3] Testing Customer Bill / Receipt Generation...');
  const billPayload: BillTicketPayload = {
    restaurantName: 'Starters4U',
    branchName: 'Madhapur Branch',
    branchAddress: 'Plot 42, Hitec City Main Rd',
    branchPhone: '+91 98765 43210',
    gstin: '36AAAAA0000A1Z5',
    billNumber: 'BILL-2026-8821',
    orderNumber: 'ORD-8821',
    orderTime: new Date().toISOString(),
    orderType: 'dine_in',
    tableNumber: 'T-14',
    customerName: 'Rohit Sharma',
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
  };

  const billHtml = generateBillHtml(billPayload, 80);
  assert.ok(billHtml.includes('BILL-2026-8821'), 'Bill number must be present');
  assert.ok(billHtml.includes('36AAAAA0000A1Z5'), 'GSTIN must be rendered');
  assert.ok(billHtml.includes('GRAND TOTAL:'), 'Grand total line must be present');
  assert.ok(billHtml.includes('605.85'), 'Correct grand total figure must be present');
  assert.ok(billHtml.includes('UPI QR'), 'Payment method must be shown');
  console.log('✓ Test 3 Passed: Thermal Bill HTML generation verified.\n');

  // Test 4: Silent Print Service in Mock Mode
  console.log('[Test 4] Testing Silent Print Service in Mock Mode...');
  const printService = new SilentPrintService();
  const testKotResult = await printService.executeTestPrint('KOT', testConfig, 'MOCK_PRINTER');
  assert.strictEqual(testKotResult.success, true, 'Mock KOT test print must succeed');
  assert.ok(testKotResult.durationMs >= 0, 'Print duration must be recorded');

  const testBillResult = await printService.executeTestPrint('BILL', testConfig, 'MOCK_PRINTER');
  assert.strictEqual(testBillResult.success, true, 'Mock Bill test print must succeed');
  console.log('✓ Test 4 Passed: Silent print execution in mock mode verified.\n');

  // Test 5: Security & Secret Leakage Check
  console.log('[Test 5] Auditing mozz_printer codebase for secrets...');
  const forbiddenKeywords = ['SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'eyJhbGciOi'];
  const srcFiles = [
    'src/main/index.ts',
    'src/main/storage.ts',
    'src/main/sseClient.ts',
    'src/main/silentPrintService.ts',
    'src/preload/index.ts',
    'src/renderer/src/App.tsx',
    'src/renderer/src/components/SettingsTab.tsx',
  ];

  for (const relPath of srcFiles) {
    const fullPath = path.join(process.cwd(), 'mozz_printer', relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const kw of forbiddenKeywords) {
        assert.ok(
          !content.includes(kw),
          `Security violation: Found forbidden secret keyword "${kw}" in ${relPath}`
        );
      }
    }
  }
  console.log('✓ Test 5 Passed: Zero secrets in mozz_printer desktop code.\n');

  // Test 6: A4 Test Only Profile (Canon G3010 Top-Left Alignment & Formatting)
  console.log('[Test 6] Testing "A4 Test Only" Paper Profile for Canon G3010...');
  const kotA4 = generateKotHtml(kotPayload, 'A4_TEST');
  assert.ok(kotA4.includes('[ A4 TEST PRINT - CANON G3010 (TOP-LEFT) ]'), 'A4 test banner must be in KOT');
  assert.ok(kotA4.includes('size: A4 portrait;'), 'A4 page size rule must be in KOT CSS');
  assert.ok(kotA4.includes('border-right: 1px dashed #777;'), 'Dashed right boundary cut-line must be present');
  assert.ok(kotA4.includes('border-bottom: 1px dashed #777;'), 'Dashed bottom boundary cut-line must be present');
  assert.ok(kotA4.includes('✂ CUT ALONG DASHED LINE FOR RECEIPT ✂'), 'Cut guide instructions must be present');

  const billA4 = generateBillHtml(billPayload, 'A4_TEST');
  assert.ok(billA4.includes('[ A4 TEST PRINT - CANON G3010 (TOP-LEFT) ]'), 'A4 test banner must be in Bill');
  assert.ok(billA4.includes('size: A4 portrait;'), 'A4 page size rule must be in Bill CSS');
  assert.ok(billA4.includes('✂ CUT ALONG DASHED LINE FOR RECEIPT ✂'), 'Cut guide must be in Bill');

  // Verify production 58mm and 80mm are strictly untouched
  assert.strictEqual(kotHtml80.includes('A4 TEST PRINT'), false, '80mm must NEVER contain A4 test banner');
  assert.strictEqual(kotHtml58.includes('A4 TEST PRINT'), false, '58mm must NEVER contain A4 test banner');
  assert.strictEqual(billHtml.includes('A4 TEST PRINT'), false, '80mm Bill must NEVER contain A4 test banner');

  // Test silent print service execution with A4_TEST config
  const a4Config: PrinterConfig = {
    station: 'billing',
    printerName: 'MOCK_PRINTER',
    paperWidthMm: 'A4_TEST',
    copies: 1,
    isAutoPrint: true,
  };
  const testA4Result = await printService.executeTestPrint('BILL', a4Config, 'MOCK_PRINTER');
  assert.strictEqual(testA4Result.success, true, 'Mock print with A4_TEST profile must succeed');
    console.log('✓ Test 6 Passed: "A4 Test Only" Canon G3010 profile, CSS positioning, and profile isolation verified.\n');
  } finally {
    if (reloadedStore) {
      reloadedStore.close();
    }
    if (store) {
      store.close();
    }
    await removeDirWithRetry(testStorageDir);
  }

  console.log('=== ALL STAGE 4 DESKTOP PRINT AGENT TESTS PASSED SUCCESSFULLY! ===');
}

runDesktopAgentTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
