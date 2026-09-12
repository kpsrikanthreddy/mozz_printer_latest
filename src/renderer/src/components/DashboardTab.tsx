import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Activity,
  Printer,
  FileText,
  Radio,
  RotateCcw,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { getStationDisplayLabel, formatDisplayOrderNumber } from '@/utils/orderUtils.js';
import type {
  PrintJob,
  AgentMetrics,
  AgentConnectionStatus,
  AppSettings,
  PrinterConfig,
} from '@/types/index.js';

interface DashboardTabProps {
  metrics: AgentMetrics;
  recentJobs: PrintJob[];
  status: AgentConnectionStatus;
  settings: AppSettings;
  printerConfigs: PrinterConfig[];
  onNavigateTab: (tab: string) => void;
  onOpenTestPrint: () => void;
  onRetryJob: (jobId: string) => void;
  onDeleteJob?: (job: PrintJob) => void;
  onCancelJob?: (job: PrintJob) => void;
  isBrowserPreview?: boolean;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  metrics,
  recentJobs,
  status,
  settings,
  printerConfigs,
  onNavigateTab,
  onOpenTestPrint,
  onRetryJob,
  onDeleteJob,
  onCancelJob,
  isBrowserPreview,
}) => {
  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${secs}s`;
  };

  const getStationLabel = (stationName: string) => {
    switch (stationName) {
      case 'billing':
        return 'Billing Counter (80mm)';
      case 'kitchen_master':
        return 'Kitchen Master (80mm)';
      case 'kitchen_pizza':
        return 'Pizza Station (58mm)';
      case 'bar_beverage':
        return 'Chinese Special (58mm)';
      default:
        return getStationDisplayLabel(stationName);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Printed */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-4 shadow-sm">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Printed</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">{metrics.totalJobsPrinted}</h3>
          </div>
        </div>

        {/* Pending Queue */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-4 shadow-sm">
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Queue</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">{metrics.pendingQueueLength}</h3>
          </div>
        </div>

        {/* Failed Jobs */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-4 shadow-sm">
          <div className="p-3 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Driver Errors</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">{metrics.totalJobsFailed}</h3>
          </div>
        </div>

        {/* Agent Uptime */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-4 shadow-sm">
          <div className="p-3 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Uptime</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">{formatUptime(metrics.connectionUptimeSeconds)}</h3>
          </div>
        </div>
      </div>

      {/* Main Two-Column Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Print Stream */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Live Print Stream
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('history')}
              className="text-xs text-orange-400 hover:text-orange-300 font-semibold transition-colors"
            >
              View Full History →
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 shadow-sm">
            {recentJobs.length === 0 ? (
              <div className="p-12 text-center">
                <Printer className="w-10 h-10 text-slate-600 mx-auto mb-3 animate-pulse" />
                <p className="text-sm font-semibold text-slate-300">No print jobs received yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  When orders are placed online or via POS, tickets will print automatically.
                </p>
                <button
                  onClick={isBrowserPreview ? undefined : onOpenTestPrint}
                  disabled={isBrowserPreview}
                  title={
                    isBrowserPreview
                      ? 'Available only in the installed Windows Print Agent.'
                      : 'Generate Test Ticket'
                  }
                  className={`mt-4 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isBrowserPreview
                      ? 'bg-slate-800/60 border border-slate-700/60 text-slate-500 cursor-not-allowed'
                      : 'bg-orange-600 hover:bg-orange-500 text-white shadow-sm cursor-pointer'
                  }`}
                >
                  Generate Test Ticket
                </button>
              </div>
            ) : (
              recentJobs.slice(0, 6).map((job) => (
                <div key={job.id} className="p-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-center space-x-3.5">
                    <div
                      className={`p-2.5 rounded-lg ${
                        job.jobType === 'KOT'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {job.jobType === 'KOT' ? (
                        <FileText className="w-5 h-5" />
                      ) : (
                        <Printer className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-white">
                          {formatDisplayOrderNumber(job.orderNumber)}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                            job.jobType === 'KOT'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {job.jobType}
                        </span>
                        {job.isReprint && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Reprint
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Station: <span className="text-slate-300">{getStationDisplayLabel(job.station)}</span> •{' '}
                        {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        job.status === 'PRINTED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : job.status === 'FAILED'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : job.status === 'PRINTING'
                          ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 animate-pulse'
                          : job.status === 'CANCELLED'
                          ? 'bg-slate-800 text-slate-400 border-slate-700'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {job.status}
                    </span>

                    {job.status === 'FAILED' && (
                      <button
                        onClick={() => onRetryJob(job.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                        title="Retry print"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {(job.status === 'PENDING' || job.status === 'PRINTING') && onCancelJob && (
                      <button
                        onClick={() => onCancelJob(job)}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/50 text-[11px] font-semibold transition-colors flex items-center space-x-1"
                        title="Cancel active print job"
                      >
                        <XCircle className="w-3 h-3 text-rose-400" />
                        <span>Cancel</span>
                      </button>
                    )}

                    {(job.status === 'PRINTED' || job.status === 'FAILED' || job.status === 'CANCELLED') && onDeleteJob && (
                      <button
                        onClick={() => onDeleteJob(job)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-800/40 transition-colors"
                        title="Delete local print record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Col: Connection & Stations Quick Status */}
        <div className="space-y-6">
          {/* Agent Engine Details */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Agent Status</h4>
              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span className="capitalize">{status.replace('_', ' ')}</span>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Backend API</span>
                <span className="text-slate-200 font-mono truncate max-w-[170px]" title={settings.apiUrl}>
                  {settings.apiUrl || 'Not Configured'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Device ID</span>
                <span className="text-slate-200 font-mono">{settings.deviceId || 'pos-term-01'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Heartbeat</span>
                <span className="text-slate-200">
                  {settings.lastHeartbeatAt
                    ? new Date(settings.lastHeartbeatAt).toLocaleTimeString()
                    : 'Awaiting ping...'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Mock Mode</span>
                <span
                  className={`font-semibold ${
                    settings.mockPrintersEnabled ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {settings.mockPrintersEnabled ? 'ENABLED (Virtual)' : 'DISABLED (Real Drivers)'}
                </span>
              </div>
            </div>
          </div>

          {/* Configured Station Printers */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Station Drivers</h4>
              <button
                onClick={() => onNavigateTab('printers')}
                className="text-xs text-orange-400 hover:text-orange-300 font-semibold"
              >
                Configure →
              </button>
            </div>

            <div className="space-y-2">
              {printerConfigs.map((cfg) => (
                <div
                  key={cfg.station}
                  className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-200">{getStationLabel(cfg.station)}</p>
                    <p className="text-[11px] text-slate-400 font-mono truncate max-w-[160px]">
                      {cfg.printerName}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                    {cfg.paperWidthMm}mm
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
