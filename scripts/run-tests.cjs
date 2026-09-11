const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testFiles = [
  'dist/test/productionSafety.test.js',
  'dist/test/stage3Requirements.test.js',
  'dist/test/agentPrint.test.js',
  'dist/test/diagnostics.test.js',
  'dist/test/orderNumberAndStation.test.js'
];

let electronPath = null;
try {
  const resolved = require('electron');
  if (typeof resolved === 'string' && fs.existsSync(resolved)) {
    electronPath = resolved;
  }
} catch (err) {
  // Electron not installed or not resolvable
}

console.log('[Test Runner] Starting Mozz Printer Test Suite...');

for (const testFile of testFiles) {
  const fullPath = path.resolve(process.cwd(), testFile);
  let passed = false;

  // 1. Try with Electron runtime first (for Electron-rebuilt native modules)
  if (electronPath) {
    const res = spawnSync(electronPath, [fullPath], {
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    if (res.status === 0) {
      passed = true;
    }
  }

  // 2. Fallback to standard Node.js runtime if Electron was not available or failed
  if (!passed) {
    console.log(`[Test Runner] Executing ${testFile} with Node runtime...`);
    const res = spawnSync(process.execPath, [fullPath], {
      stdio: 'inherit',
      env: process.env
    });
    if (res.status === 0) {
      passed = true;
    } else {
      console.error(`[Test Runner] Test failed: ${testFile} (exit code ${res.status})`);
      process.exit(res.status || 1);
    }
  }
}

console.log('[Test Runner] All test suites passed successfully.');
