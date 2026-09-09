// scripts/electron-sqlite-smoke-test.cjs
// Verifies better-sqlite3 native binary against Electron runtime ABI

const electron = require('electron');
const app = electron && electron.app;

function exitWith(code) {
  if (app && typeof app.exit === 'function') {
    app.exit(code);
  } else {
    process.exit(code);
  }
}

console.log('============================================================');
console.log('🔍 ELECTRON RUNTIME SQLITE SMOKE TEST');
console.log('============================================================');
console.log('Process PID:', process.pid);
console.log('Electron Version:', process.versions.electron || 'NOT_DETECTED');
console.log('Embedded Node Version:', process.versions.node);
console.log('Electron ABI (modules):', process.versions.modules);
console.log('Platform / Arch:', process.platform, process.arch);

if (!process.versions.electron) {
  console.error('FATAL: Smoke test must run within Electron runtime, not regular Node.js!');
  exitWith(1);
}

try {
  console.log('\n[1/4] Loading better-sqlite3 native module...');
  const Database = require('better-sqlite3');
  console.log('  ✔ better-sqlite3 loaded successfully.');

  console.log('\n[2/4] Initializing in-memory SQLite database (:memory:)...');
  const db = new Database(':memory:');
  console.log('  ✔ In-memory SQLite database instance created.');

  console.log('\n[3/4] Executing SELECT 1 query...');
  const result = db.prepare('SELECT 1 as val').get();
  console.log('  Query Result:', JSON.stringify(result));
  if (!result || result.val !== 1) {
    throw new Error('Query validation failed: ' + JSON.stringify(result));
  }
  console.log('  ✔ SELECT 1 executed successfully.');

  console.log('\n[4/4] Closing in-memory database...');
  db.close();
  console.log('  ✔ Database closed cleanly.');

  console.log('\n============================================================');
  console.log('🎉 ELECTRON RUNTIME SQLITE SMOKE TEST PASSED!');
  console.log('============================================================');
  exitWith(0);
} catch (error) {
  console.error('\n❌ CRITICAL: Electron runtime SQLite smoke test failed:');
  console.error(error);
  exitWith(1);
}
