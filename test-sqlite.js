
const { app } = require('electron');
try {
  console.log('Testing better-sqlite3 in Electron...');
  console.log('process.versions:', process.versions);
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  const row = db.prepare('SELECT 1 as val').get();
  if (!row || row.val !== 1) {
    throw new Error('Query returned unexpected result: ' + JSON.stringify(row));
  }
  db.close();
  console.log('SUCCESS: better-sqlite3 executed SELECT 1 in Electron:', row);
  if (app) app.exit(0); else process.exit(0);
} catch (err) {
  console.error('FAILURE in Electron SQLite smoke test:', err);
  if (app) app.exit(1); else process.exit(1);
}
