import http from 'http';
import https from 'https';
import { URL } from 'url';
import { localStore } from './storage.js';
import { silentPrintService } from './silentPrintService.js';
import type {
  PrintJob,
  AgentConnectionStatus,
} from '../types/index.js';

export type JobEventHandler = (event: {
  type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED';
  job: PrintJob;
}) => void;

export type ConnectionStatusHandler = (status: AgentConnectionStatus) => void;

/**
 * Calculates reconnect delay with immediate initial attempts followed by
 * exponential backoff with randomized jitter.
 * - Attempt 0: ~500ms
 * - Attempt 1: ~1500ms
 * - Attempt 2: ~3000ms
 * - Attempt 3+: Exponential backoff up to 30,000ms with jitter.
 */
export function calculateReconnectDelay(attemptNumber: number): number {
  if (attemptNumber <= 0) return 500;
  if (attemptNumber === 1) return 1500;
  if (attemptNumber === 2) return 3000;

  const base = 3000 * Math.pow(1.6, attemptNumber - 2);
  const jitter = Math.floor(Math.random() * 2000); // 0-2000ms jitter
  return Math.min(30000, Math.floor(base + jitter));
}

export class SsePrintAgentClient {
  private isRunning = false;
  private sseRequest: http.ClientRequest | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionStatus: AgentConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private isComputerOffline = false;
  private jobListeners: Set<JobEventHandler> = new Set();
  private statusListeners: Set<ConnectionStatusHandler> = new Set();

  public onJob(listener: JobEventHandler): () => void {
    this.jobListeners.add(listener);
    return () => this.jobListeners.delete(listener);
  }

  public onStatus(listener: ConnectionStatusHandler): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: AgentConnectionStatus) {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      console.log(`[AgentClient] Status changed to: ${status}`);
      for (const listener of this.statusListeners) {
        try {
          listener(status);
        } catch {
          // ignore
        }
      }
    }
  }

  public getStatus(): AgentConnectionStatus {
    return this.connectionStatus;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  public isOffline(): boolean {
    return this.isComputerOffline;
  }

  /**
   * Starts the print agent background listeners (SSE primary + scalable polling fallback + heartbeat)
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[AgentClient] Starting agent client services...');
    this.connect();
    this.startHeartbeatLoop();
    this.startPollingFallback();
  }

  /**
   * Stops all active connections and timers
   */
  public stop(): void {
    this.isRunning = false;
    this.cleanupSse();
    if (this.pollingTimer) clearTimeout(this.pollingTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.setStatus('disconnected');
    console.log('[AgentClient] Stopped all agent client services.');
  }

  private cleanupSse(): void {
    if (this.sseRequest) {
      try {
        this.sseRequest.destroy();
      } catch {
        // ignore
      }
      this.sseRequest = null;
    }
  }

  /**
   * Connects to Server-Sent Events stream using secure Authorization header
   * (Primary Real-Time Push Channel)
   */
  public connect(): void {
    if (!this.isRunning) return;

    const settings = localStore.getSettings();
    const token = localStore.getDeviceToken();

    if (!settings.isRegistered || !token || !settings.apiUrl) {
      this.setStatus('unauthorized');
      return;
    }

    this.cleanupSse();
    this.setStatus('reconnecting');

    try {
      const urlStr = `${settings.apiUrl.replace(/\/$/, '')}/api/print-agent/events`;
      const parsedUrl = new URL(urlStr);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          // SECURE: Device token is transmitted solely via standard Authorization header
          Authorization: `Bearer ${token}`,
        },
      };

      const req = client.request(options, (res) => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          console.error('[AgentClient] Unauthorized: Device token was rejected or deactivated by server');
          this.setStatus('unauthorized');
          this.cleanupSse();
          return;
        }

        if (res.statusCode !== 200) {
          console.warn(`[AgentClient] SSE returned status ${res.statusCode}, falling back to backoff reconnection`);
          this.scheduleReconnect();
          return;
        }

        console.log('[AgentClient] Connected to primary live SSE stream successfully');
        this.isComputerOffline = false;
        this.reconnectAttempts = 0;
        this.setStatus('connected_sse');

        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const block of lines) {
            this.handleSseBlock(block.trim());
          }
        });

        res.on('end', () => {
          console.warn('[AgentClient] SSE stream closed by server, scheduling reconnect...');
          this.scheduleReconnect();
        });

        res.on('error', (err) => {
          console.warn('[AgentClient] SSE stream socket error:', err.message);
          this.scheduleReconnect();
        });
      });

      req.on('error', (err: any) => {
        console.warn('[AgentClient] Failed to establish SSE request:', err.message);
        if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH' || err.code === 'EAI_AGAIN') {
          this.isComputerOffline = true;
        }
        this.scheduleReconnect();
      });

      this.sseRequest = req;
      req.end();
    } catch (err: any) {
      console.error('[AgentClient] SSE setup exception:', err.message);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedules reconnection with immediate initial attempts followed by exponential backoff with jitter
   */
  public scheduleReconnect(): void {
    this.cleanupSse();
    if (!this.isRunning) return;

    // Switch status to polling fallback while waiting for SSE reconnection
    if (this.connectionStatus !== 'unauthorized') {
      this.setStatus('connected_polling');
    }

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay = calculateReconnectDelay(this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[AgentClient] SSE reconnect attempt #${this.reconnectAttempts} scheduled in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      if (this.isRunning) {
        this.connect();
      }
    }, delay);
  }

  private handleSseBlock(block: string): void {
    if (!block) return;

    let eventType = 'message';
    let dataStr = '';

    const lines = block.split('\n');
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        dataStr = line.substring(5).trim();
      }
    }

    if (eventType === 'heartbeat') {
      localStore.saveSettings({ lastHeartbeatAt: new Date().toISOString() });
      return;
    }

    if (eventType === 'device-deactivated') {
      console.warn('[AgentClient] Server notified that this device has been deactivated.');
      this.setStatus('unauthorized');
      this.stop();
      return;
    }

    if (eventType === 'new-job' && dataStr) {
      try {
        const job: PrintJob = JSON.parse(dataStr);
        console.log(`[AgentClient] [SSE] Received print job: ${job.id} (${job.jobType} - ${job.orderNumber})`);
        this.processIncomingJob(job);
      } catch (err) {
        console.error('[AgentClient] Failed to parse SSE print job payload:', err);
      }
      return;
    }

    if (eventType === 'job-status-updated' && dataStr) {
      try {
        const update = JSON.parse(dataStr);
        console.log(`[AgentClient] [SSE] Job status updated: ${update.id} -> ${update.status}`);
      } catch (err) {
        console.error('[AgentClient] Failed to parse SSE job-status-updated payload:', err);
      }
      return;
    }
  }

  /**
   * Scalable Polling Fallback:
   * Runs approximately every 15–30 seconds.
   * - Pauses or skips when SSE stream is actively connected.
   * - Pauses when computer is offline to prevent network spam.
   * - Automatically yields back to SSE when stream reconnects.
   */
  public startPollingFallback(): void {
    if (this.pollingTimer) clearTimeout(this.pollingTimer);

    const scheduleNextPoll = () => {
      if (!this.isRunning) return;

      // Scalable interval: 15 to 30 seconds with random jitter
      const nextInterval = Math.floor(15000 + Math.random() * 15000);

      this.pollingTimer = setTimeout(async () => {
        if (!this.isRunning) return;

        // 1. If SSE is active, skip polling completely (Zero unnecessary load)
        if (this.connectionStatus === 'connected_sse') {
          scheduleNextPoll();
          return;
        }

        const settings = localStore.getSettings();
        const token = localStore.getDeviceToken();

        if (!settings.isRegistered || !token) {
          scheduleNextPoll();
          return;
        }

        try {
          const url = `${settings.apiUrl.replace(/\/$/, '')}/api/print-agent/jobs?status=PENDING`;
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (res.status === 401 || res.status === 403) {
            this.setStatus('unauthorized');
            return;
          }

          if (res.ok) {
            this.isComputerOffline = false;
            const jobs = (await res.json()) as PrintJob[];
            if (this.connectionStatus === 'reconnecting' || this.connectionStatus === 'disconnected') {
              this.setStatus('connected_polling');
            }

            for (const job of jobs) {
              await this.processIncomingJob(job);
            }

            // If SSE is disconnected and server is answering, try to restore SSE!
            if ((this.connectionStatus as string) !== 'connected_sse' && !this.sseRequest) {
              console.log('[AgentClient] Polling responded successfully; attempting to promote back to SSE stream...');
              this.connect();
            }
          }
        } catch (err: any) {
          // Detect offline state
          if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH' || err.code === 'ECONNREFUSED') {
            if (!this.isComputerOffline) {
              console.warn('[AgentClient] Computer appears to be offline. Pausing active polling.');
              this.isComputerOffline = true;
            }
          }
          if (this.connectionStatus !== 'unauthorized') {
            this.setStatus('disconnected');
          }
        }

        scheduleNextPoll();
      }, nextInterval);
    };

    scheduleNextPoll();
  }

  /**
   * Periodic device heartbeat ping (every 25-30 seconds)
   */
  private startHeartbeatLoop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(async () => {
      if (!this.isRunning) return;
      const settings = localStore.getSettings();
      const token = localStore.getDeviceToken();
      if (!settings.isRegistered || !token) return;

      try {
        const url = `${settings.apiUrl.replace(/\/$/, '')}/api/print-agent/devices/heartbeat`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.ok) {
          localStore.saveSettings({ lastHeartbeatAt: new Date().toISOString() });
          this.isComputerOffline = false;
        } else if (res.status === 401 || res.status === 403) {
          this.setStatus('unauthorized');
        }
      } catch {
        // network issue
      }
    }, 25000);
  }

  /**
   * Processes an incoming job with atomic claiming, idempotency checking,
   * local persistence, and silent driver execution.
   */
  public async processIncomingJob(job: PrintJob, forceReprint = false): Promise<boolean> {
    const settings = localStore.getSettings();
    const token = localStore.getDeviceToken();

    // 1. Duplicate Prevention & Local Idempotency Check
    if (!forceReprint && localStore.isJobCompleted(job.id, job.idempotencyKey)) {
      console.log(`[AgentClient] Job ${job.id} was already completed locally. Skipping to prevent duplicate ticket.`);
      return true;
    }

    // Save job locally in SQLite
    localStore.saveJob(job);
    this.emitJobEvent('NEW_JOB', job);

    // 2. Claim job on backend (Atomic lock)
    if (token && settings.apiUrl) {
      try {
        const claimUrl = `${settings.apiUrl.replace(/\/$/, '')}/api/print-agent/jobs/${job.id}/claim`;
        const claimRes = await fetch(claimUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (claimRes.status === 409) {
          console.warn(`[AgentClient] Job ${job.id} was already claimed by another device. Skipping.`);
          return false;
        }
      } catch (err: any) {
        console.warn(`[AgentClient] Network issue claiming job ${job.id}, proceeding with local execution:`, err.message);
      }
    }

    // 3. Mark job as PRINTING locally in SQLite and on backend
    localStore.updateJob(job.id, { status: 'PRINTING' });
    this.emitJobEvent('JOB_UPDATED', { ...job, status: 'PRINTING' });

    if (token && settings.apiUrl) {
      try {
        const statusUrl = `${settings.apiUrl.replace(/\/$/, '')}/api/print-agent/jobs/${job.id}/status`;
        await fetch(statusUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'PRINTING' }),
        });
      } catch {
        // ignore
      }
    }

    // 4. Silent Print execution via Windows Driver
    const printResult = await silentPrintService.executeJob(job);

    // 5. Finalize status (PRINTED vs FAILED)
    if (printResult.success) {
      localStore.markJobCompleted(job.id);
      const updatedJob = localStore.getJob(job.id) || { ...job, status: 'PRINTED' as const };
      this.emitJobEvent('JOB_COMPLETED', updatedJob);

      if (token && settings.apiUrl) {
        try {
          const statusUrl = `${settings.apiUrl.replace(/\/$/, '')}/api/print-agent/jobs/${job.id}/status`;
          await fetch(statusUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'PRINTED' }),
          });
        } catch {
          // ignore
        }
      }
      return true;
    } else {
      localStore.updateJob(job.id, {
        status: 'FAILED',
        errorMessage: printResult.error,
        retryCount: (job.retryCount || 0) + 1,
        failedAt: new Date().toISOString(),
      });
      const failedJob = localStore.getJob(job.id) || {
        ...job,
        status: 'FAILED' as const,
        errorMessage: printResult.error,
      };
      this.emitJobEvent('JOB_UPDATED', failedJob);

      if (token && settings.apiUrl) {
        try {
          const statusUrl = `${settings.apiUrl.replace(/\/$/, '')}/api/print-agent/jobs/${job.id}/status`;
          await fetch(statusUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: 'FAILED',
              errorMessage: printResult.error,
            }),
          });
        } catch {
          // ignore
        }
      }
      return false;
    }
  }

  private emitJobEvent(type: 'NEW_JOB' | 'JOB_UPDATED' | 'JOB_COMPLETED', job: PrintJob): void {
    for (const listener of this.jobListeners) {
      try {
        listener({ type, job });
      } catch {
        // ignore
      }
    }
  }
}

export const agentClient = new SsePrintAgentClient();
