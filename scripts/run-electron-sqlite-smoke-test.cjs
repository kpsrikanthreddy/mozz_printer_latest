// scripts/run-electron-sqlite-smoke-test.cjs
// Launches Electron binary with better-sqlite3 smoke test to verify Electron ABI
const { spawnSync } = require('child_process');
const electronPath = require('electron');
const path = require('path');

const scriptPath = path.resolve(__dirname, 'electron-sqlite-smoke-test.cjs');
console.log('[Smoke Test Runner] Launching Electron binary:', electronPath);

const result = spawnSync(electronPath, [scriptPath], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

if (result.status !== 0) {
  console.error(`[Smoke Test Runner] Electron-runtime SQLite smoke test FAILED with status ${result.status}`);
  process.exit(result.status || 1);
}

console.log('[Smoke Test Runner] Electron-runtime SQLite smoke test completed successfully.');
