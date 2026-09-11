import fs from 'fs';
import path from 'path';
import type DatabaseType from 'better-sqlite3';
import { resolveOrderNumber } from '../utils/orderUtils.js';
import type {
  PrintJob,
  PrintJobStatus,
  PrintAttemptLog,
  PrinterConfig,
  PrinterStation,
} from '../types/index.js';

let BetterSqlite3Constructor: any = null;
let betterSqlite3LoadError: Error | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BetterSqlite3Constructor = require('better-sqlite3');
} catch (err: any) {
  betterSqlite3LoadError = err instanceof Error ? err : new Error(String(err));
}

let electron: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  electron = require('electron');
} catch {
  // outside electron runtime
}

export interface RetentionPolicy {
  completedJobRetentionDays: number;
  attemptLogsRetentionDays: number;
  printedJobsRetentionDays: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  completedJobRetentionDays: 30,
  attemptLogsRetentionDays: 14,
  printedJobsRetentionDays: 14,
};

export class SqlitePrintQueue {
  private db: DatabaseType.Database | null = null;
  private dbPath: string;
  private retentionPolicy: RetentionPolicy;
  private initError: Error | null = null;

  constructor(customDir?: string, retentionPolicy: RetentionPolicy = DEFAULT_RETENTION_POLICY) {
    let baseDir = customDir || '';
    if (!baseDir) {
      try {
        baseDir = electron?.app?.getPath?.('userData') || process.cwd();
      } catch {
        baseDir = process.cwd();
      }
    }
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.dbPath = path.join(baseDir, 'mozz_printer.sqlite');
    this.retentionPolicy = retentionPolicy;
    this.init();
  }

  public isReady(): boolean {
    return this.db !== null && this.initError === null;
  }

  public getInitError(): Error | null {
    return this.initError;
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  private init(): void {
    try {
      this.openDatabase();
      this.applyPragmas();
      this.createSchema();
      this.backfillMissingOrderNumbers();
      this.performStartupRecovery();
      this.applyRetentionCleanup();
      this.initError = null;
    } catch (err: any) {
      this.initError = err instanceof Error ? err : new Error(String(err));
      console.error('[SqliteQueue] Failed to initialize SQLite database:', err.message);
      if (BetterSqlite3Constructor && !betterSqlite3LoadError) {
        this.handleCorruptionOrFailure(err);
      }
    }
  }

  private openDatabase(): void {
    if (betterSqlite3LoadError || !BetterSqlite3Constructor) {
      throw (
        betterSqlite3LoadError ||
        new Error('better-sqlite3 native module is not available in the current runtime environment.')
      );
    }
    this.db = new BetterSqlite3Constructor(this.dbPath, {
      fileMustExist: false,
      timeout: 5000,
    });
  }

  private applyPragmas(): void {
    if (!this.db) return;
    // Enable Write-Ahead Logging for high crash-resilience and concurrent reads
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
  }

  private createSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      -- Core print jobs queue
      CREATE TABLE IF NOT EXISTS print_jobs (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        order_number TEXT,
        job_type TEXT NOT NULL CHECK(job_type IN ('KOT', 'BILL')),
        station TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('PENDING', 'CLAIMED', 'PRINTING', 'PRINTED', 'FAILED', 'UNCERTAIN_RECOVERY', 'CANCELLED', 'SKIPPED')),
        is_reprint INTEGER NOT NULL DEFAULT 0,
        claimed_by_device_id TEXT,
        claimed_at TEXT,
        printed_at TEXT,
        failed_at TEXT,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        local_received_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON print_jobs(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_idempotency ON print_jobs(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_jobs_order ON print_jobs(order_id);

      -- Deduplication / Idempotency completed index
      CREATE TABLE IF NOT EXISTS completed_job_ids (
        job_id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        order_id TEXT,
        job_type TEXT,
        completed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_completed_completed_at ON completed_job_ids(completed_at);

      -- Print attempt history and spool audit logs
      CREATE TABLE IF NOT EXISTS print_attempts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        station TEXT,
        printer_name TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        attempted_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attempts_job ON print_attempts(job_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_time ON print_attempts(attempted_at DESC);

      -- Printer configuration per station
      CREATE TABLE IF NOT EXISTS printer_configs (
        station TEXT PRIMARY KEY,
        printer_name TEXT NOT NULL,
        paper_width_mm INTEGER NOT NULL DEFAULT 80,
        copies INTEGER NOT NULL DEFAULT 1,
        is_auto_print INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Migration / backfill-safe handling for existing SQLite records where order_number is missing or empty.
   */
  private backfillMissingOrderNumbers(): void {
    if (!this.db) return;
    try {
      const rowsWithoutOrderNum = this.db
        .prepare(
          `SELECT id, order_id, order_number, payload_json FROM print_jobs WHERE order_number IS NULL OR trim(order_number) = '' OR order_number = '#'`
        )
        .all();

      if (rowsWithoutOrderNum && rowsWithoutOrderNum.length > 0) {
        const updateStmt = this.db.prepare(
          `UPDATE print_jobs SET order_number = ?, updated_at = ? WHERE id = ?`
        );
        const now = new Date().toISOString();
        const tx = this.db.transaction(() => {
          for (const row of rowsWithoutOrderNum as any[]) {
            let payload: any = {};
            try {
              payload = JSON.parse(row.payload_json || '{}');
            } catch {
              payload = {};
            }
            const resolved = resolveOrderNumber({
              orderNumber: row.order_number,
              orderId: row.order_id,
              payload,
            });
            updateStmt.run(resolved || 'Unknown Order', now, row.id);
          }
        });
        tx();
        console.log(`[SqliteQueue] Backfilled order numbers for ${rowsWithoutOrderNum.length} existing print jobs.`);
      }
    } catch (bfErr) {
      console.warn('[SqliteQueue] Warning during order_number backfill:', bfErr);
    }
  }

  /**
   * Startup Recovery:
   * Any jobs left in PRINTING or CLAIMED state after an unexpected shutdown or crash
   * MUST be marked UNCERTAIN_RECOVERY to prevent double printing tickets!
   */
  private performStartupRecovery(): void {
    if (!this.db) return;

    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE print_jobs 
         SET status = 'UNCERTAIN_RECOVERY',
             error_message = 'Interrupted: Application shut down while printing/claimed. Physical ticket must be verified before manual retry.',
             updated_at = ?
         WHERE status IN ('PRINTING', 'CLAIMED')`
      )
      .run(now);

    if (result.changes > 0) {
      console.warn(
        `[SqliteQueue] Startup Recovery: Safely flagged ${result.changes} in-flight jobs as UNCERTAIN_RECOVERY to prevent accidental double-printing.`
      );
    }
  }

  /**
   * Configurable retention policy cleanup
   */
  public applyRetentionCleanup(): void {
    if (!this.db) return;

    try {
      const now = Date.now();
      const compCutoff = new Date(
        now - this.retentionPolicy.completedJobRetentionDays * 24 * 60 * 60 * 1000
      ).toISOString();
      const attCutoff = new Date(
        now - this.retentionPolicy.attemptLogsRetentionDays * 24 * 60 * 60 * 1000
      ).toISOString();
      const jobCutoff = new Date(
        now - this.retentionPolicy.printedJobsRetentionDays * 24 * 60 * 60 * 1000
      ).toISOString();

      const tx = this.db.transaction(() => {
        this.db!
          .prepare(`DELETE FROM completed_job_ids WHERE completed_at < ?`)
          .run(compCutoff);
        this.db!
          .prepare(`DELETE FROM print_attempts WHERE attempted_at < ?`)
          .run(attCutoff);
        this.db!
          .prepare(`DELETE FROM print_jobs WHERE status = 'PRINTED' AND printed_at < ?`)
          .run(jobCutoff);
      });
      tx();
    } catch (err) {
      console.error('[SqliteQueue] Error applying retention cleanup:', err);
    }
  }

  /**
   * Disaster recovery for SQLite file corruption
   */
  private handleCorruptionOrFailure(err: any): void {
    console.error('[SqliteQueue] CRITICAL: SQLite corruption or fatal error encountered:', err);
    try {
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // ignore
        }
        this.db = null;
      }
      if (fs.existsSync(this.dbPath)) {
        const corruptBackup = `${this.dbPath}.corrupted.${Date.now()}`;
        fs.renameSync(this.dbPath, corruptBackup);
        console.warn(`[SqliteQueue] Corrupted database backed up to: ${corruptBackup}`);
      }
      // Re-initialize fresh database cleanly
      this.openDatabase();
      this.applyPragmas();
      this.createSchema();
      this.initError = null;
      console.log('[SqliteQueue] Successfully recovered and initialized fresh SQLite database.');
    } catch (reErr: any) {
      this.initError = reErr instanceof Error ? reErr : new Error(String(reErr));
      console.error('[SqliteQueue] Fatal error during corruption recovery:', reErr);
    }
  }

  // ==========================================
  // JOBS QUEUE OPERATIONS
  // ==========================================

  public isJobCompleted(jobId: string, idempotencyKey?: string): boolean {
    if (!this.db) return false;
    if (idempotencyKey) {
      const row = this.db
        .prepare(`SELECT 1 FROM completed_job_ids WHERE job_id = ? OR idempotency_key = ? LIMIT 1`)
        .get(jobId, idempotencyKey);
      return !!row;
    }
    const row = this.db
      .prepare(`SELECT 1 FROM completed_job_ids WHERE job_id = ? LIMIT 1`)
      .get(jobId);
    return !!row;
  }

  public markJobCompleted(jobId: string): void {
    if (!this.db) return;

    const job = this.getJob(jobId);
    const now = new Date().toISOString();
    const idempotencyKey = job?.idempotencyKey || `job_${jobId}`;

    const tx = this.db.transaction(() => {
      this.db!
        .prepare(
          `INSERT OR IGNORE INTO completed_job_ids (job_id, idempotency_key, order_id, job_type, completed_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(jobId, idempotencyKey, job?.orderId || null, job?.jobType || null, now);

      this.db!
        .prepare(
          `UPDATE print_jobs 
           SET status = 'PRINTED', printed_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(now, now, jobId);
    });

    tx();
  }

  public saveJob(job: PrintJob): void {
    if (!this.db) return;

    const now = new Date().toISOString();
    const localReceivedAt = job.localReceivedAt || now;

    const resolvedOrderNumber = resolveOrderNumber({
      orderNumber: job.orderNumber,
      orderId: job.orderId,
      payload: job.payload,
    });

    const updatedPayload = {
      ...(job.payload || {}),
      orderNumber: resolvedOrderNumber,
    };
    const payloadJson = JSON.stringify(updatedPayload);

    this.db
      .prepare(
        `INSERT INTO print_jobs (
          id, restaurant_id, branch_id, order_id, order_number, job_type, station,
          idempotency_key, status, is_reprint, claimed_by_device_id, claimed_at,
          printed_at, failed_at, error_message, retry_count, max_retries,
          payload_json, created_at, updated_at, local_received_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          order_number = COALESCE(excluded.order_number, print_jobs.order_number),
          status = excluded.status,
          retry_count = excluded.retry_count,
          error_message = excluded.error_message,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`
      )
      .run(
        job.id,
        job.restaurantId,
        job.branchId,
        job.orderId,
        resolvedOrderNumber,
        job.jobType,
        job.station,
        job.idempotencyKey || job.id || `idemp_${Date.now()}`,
        job.status,
        job.isReprint ? 1 : 0,
        job.claimedByDeviceId || null,
        job.claimedAt || null,
        job.printedAt || null,
        job.failedAt || null,
        job.errorMessage || null,
        job.retryCount || 0,
        job.maxRetries || 3,
        payloadJson,
        job.createdAt || now,
        now,
        localReceivedAt
      );
  }

  public getJob(jobId: string): PrintJob | undefined {
    if (!this.db) return undefined;
    const row: any = this.db.prepare(`SELECT * FROM print_jobs WHERE id = ?`).get(jobId);
    if (!row) return undefined;
    return this.mapRowToJob(row);
  }

  public updateJob(jobId: string, updates: Partial<PrintJob>): PrintJob | undefined {
    if (!this.db) return undefined;

    const existing = this.getJob(jobId);
    if (!existing) return undefined;

    const updatedJob = { ...existing, ...updates };
    this.saveJob(updatedJob);
    return updatedJob;
  }

  public getPendingJobs(): PrintJob[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM print_jobs 
         WHERE status IN ('PENDING', 'CLAIMED', 'PRINTING')
         ORDER BY created_at DESC`
      )
      .all();
    return rows.map((r: any) => this.mapRowToJob(r));
  }

  public getFailedJobs(): PrintJob[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM print_jobs 
         WHERE status IN ('FAILED', 'UNCERTAIN_RECOVERY')
         ORDER BY created_at DESC`
      )
      .all();
    return rows.map((r: any) => this.mapRowToJob(r));
  }

  public getJobHistory(limit = 100): PrintJob[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM print_jobs 
         ORDER BY created_at DESC 
         LIMIT ?`
      )
      .all(limit);
    return rows.map((r: any) => this.mapRowToJob(r));
  }

  public clearCompletedJobs(): number {
    if (!this.db) return 0;
    const result = this.db
      .prepare(`DELETE FROM print_jobs WHERE status IN ('PRINTED', 'SKIPPED')`)
      .run();
    return result.changes;
  }

  /**
   * Delete a single job and its associated attempt logs and completed deduplication record from local SQLite.
   * This is strictly local to the Mozz Print Agent and NEVER touches the remote Starters4U server/orders.
   */
  public deleteJob(jobId: string): boolean {
    if (!this.db) return false;
    const job = this.getJob(jobId);
    const idempotencyKey = job?.idempotencyKey;

    const tx = this.db.transaction(() => {
      this.db!.prepare(`DELETE FROM print_attempts WHERE job_id = ?`).run(jobId);
      if (idempotencyKey) {
        this.db!.prepare(`DELETE FROM completed_job_ids WHERE job_id = ? OR idempotency_key = ?`).run(jobId, idempotencyKey);
      } else {
        this.db!.prepare(`DELETE FROM completed_job_ids WHERE job_id = ?`).run(jobId);
      }
      const res = this.db!.prepare(`DELETE FROM print_jobs WHERE id = ?`).run(jobId);
      return res.changes > 0;
    });

    return tx();
  }

  /**
   * Delete multiple jobs by IDs from local SQLite.
   */
  public deleteJobs(jobIds: string[]): number {
    if (!this.db || jobIds.length === 0) return 0;

    const tx = this.db.transaction(() => {
      let count = 0;
      const deleteAttemptsStmt = this.db!.prepare(`DELETE FROM print_attempts WHERE job_id = ?`);
      const deleteCompletedStmt = this.db!.prepare(`DELETE FROM completed_job_ids WHERE job_id = ? OR idempotency_key = ?`);
      const deleteJobStmt = this.db!.prepare(`DELETE FROM print_jobs WHERE id = ?`);

      for (const id of jobIds) {
        const job = this.getJob(id);
        deleteAttemptsStmt.run(id);
        if (job?.idempotencyKey) {
          deleteCompletedStmt.run(id, job.idempotencyKey);
        } else {
          this.db!.prepare(`DELETE FROM completed_job_ids WHERE job_id = ?`).run(id);
        }
        const res = deleteJobStmt.run(id);
        count += res.changes;
      }
      return count;
    });

    return tx();
  }

  /**
   * Cancel an active or pending print job locally.
   */
  public cancelJob(jobId: string, reason = 'Cancelled by operator'): boolean {
    if (!this.db) return false;
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `UPDATE print_jobs 
         SET status = 'CANCELLED',
             error_message = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(reason, now, jobId);
    return res.changes > 0;
  }

  private mapRowToJob(row: any): PrintJob {
    let payload: any = {};
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch {
      payload = {};
    }

    const resolvedOrderNumber = resolveOrderNumber({
      orderNumber: row.order_number,
      orderId: row.order_id,
      payload,
    });

    const isTest = Boolean(
      payload?.isTest ||
      row.id?.startsWith('TEST-') ||
      row.order_number?.startsWith('TEST-')
    );

    return {
      id: row.id,
      restaurantId: row.restaurant_id,
      branchId: row.branch_id,
      orderId: row.order_id,
      orderNumber: resolvedOrderNumber || 'Unknown Order',
      jobType: row.job_type,
      station: row.station,
      idempotencyKey: row.idempotency_key,
      status: row.status as PrintJobStatus,
      isTest: isTest || undefined,
      isReprint: Boolean(row.is_reprint),
      claimedByDeviceId: row.claimed_by_device_id,
      claimedAt: row.claimed_at,
      printedAt: row.printed_at,
      failedAt: row.failed_at,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      payload: payload as any,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      localReceivedAt: row.local_received_at,
    };
  }

  // ==========================================
  // ATTEMPT LOGS OPERATIONS
  // ==========================================

  public logAttempt(log: PrintAttemptLog): void {
    if (!this.db) return;

    this.db
      .prepare(
        `INSERT INTO print_attempts (
          id, job_id, station, printer_name, attempt_number,
          status, error_message, duration_ms, attempted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        log.id,
        log.jobId,
        (log as any).station || null,
        log.printerName,
        log.attemptNumber,
        log.status,
        log.errorMessage || null,
        log.durationMs || 0,
        log.timestamp || new Date().toISOString()
      );
  }

  public getAttemptLogs(jobIdOrLimit?: string | number, limit = 200): PrintAttemptLog[] {
    if (!this.db) return [];
    let rows: any[] = [];
    if (typeof jobIdOrLimit === 'string') {
      rows = this.db
        .prepare(`SELECT * FROM print_attempts WHERE job_id = ? ORDER BY attempted_at DESC LIMIT ?`)
        .all(jobIdOrLimit, limit);
    } else {
      const numLimit = typeof jobIdOrLimit === 'number' ? jobIdOrLimit : limit;
      rows = this.db
        .prepare(`SELECT * FROM print_attempts ORDER BY attempted_at DESC LIMIT ?`)
        .all(numLimit);
    }

    return rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      attemptNumber: r.attempt_number,
      status: r.status as 'SUCCESS' | 'FAILURE',
      printerName: r.printer_name,
      errorMessage: r.error_message,
      durationMs: r.duration_ms,
      timestamp: r.attempted_at,
    }));
  }

  // ==========================================
  // PRINTER CONFIGURATIONS IN SQLITE
  // ==========================================

  public getPrinterConfigs(): PrinterConfig[] {
    if (!this.db) return [];
    const rows: any[] = this.db.prepare(`SELECT * FROM printer_configs ORDER BY station ASC`).all();
    if (rows.length === 0) return [];
    return rows.map((r) => ({
      station: r.station as PrinterStation,
      printerName: r.printer_name,
      paperWidthMm:
        r.paper_width_mm === 'A4_TEST' || r.paper_width_mm === 210
          ? 'A4_TEST'
          : Number(r.paper_width_mm) === 58
          ? 58
          : 80,
      copies: r.copies,
      isAutoPrint: Boolean(r.is_auto_print),
    }));
  }

  public getStationPrinter(station: string): PrinterConfig | undefined {
    if (!this.db) return undefined;
    const row: any = this.db
      .prepare(`SELECT * FROM printer_configs WHERE station = ? LIMIT 1`)
      .get(station);
    if (!row) return undefined;
    return {
      station: row.station as PrinterStation,
      printerName: row.printer_name,
      paperWidthMm:
        row.paper_width_mm === 'A4_TEST' || row.paper_width_mm === 210
          ? 'A4_TEST'
          : Number(row.paper_width_mm) === 58
          ? 58
          : 80,
      copies: row.copies,
      isAutoPrint: Boolean(row.is_auto_print),
    };
  }

  public savePrinterConfig(config: PrinterConfig): void {
    if (!this.db) return;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO printer_configs (station, printer_name, paper_width_mm, copies, is_auto_print, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(station) DO UPDATE SET
           printer_name = excluded.printer_name,
           paper_width_mm = excluded.paper_width_mm,
           copies = excluded.copies,
           is_auto_print = excluded.is_auto_print,
           updated_at = excluded.updated_at`
      )
      .run(
        config.station,
        config.printerName,
        config.paperWidthMm || 80,
        config.copies || 1,
        config.isAutoPrint ? 1 : 0,
        now
      );
  }

  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore
      }
      this.db = null;
    }
  }
}

let defaultSqliteQueueInstance: SqlitePrintQueue | null = null;

export function getSqliteQueue(customDir?: string): SqlitePrintQueue {
  if (customDir) {
    return new SqlitePrintQueue(customDir);
  }
  if (!defaultSqliteQueueInstance) {
    defaultSqliteQueueInstance = new SqlitePrintQueue();
  }
  return defaultSqliteQueueInstance;
}

export const sqliteQueue: SqlitePrintQueue = new Proxy({} as SqlitePrintQueue, {
  get(_target, prop) {
    const instance = getSqliteQueue();
    const val = (instance as any)[prop];
    if (typeof val === 'function') {
      return val.bind(instance);
    }
    return val;
  },
  set(_target, prop, value) {
    const instance = getSqliteQueue();
    (instance as any)[prop] = value;
    return true;
  },
});

