import React, { useState } from 'react';
import {
  AlertTriangle,
  RotateCcw,
  Clock,
  Printer,
  FileText,
  Search,
  CheckCircle,
  Trash2,
  XCircle,
} from 'lucide-react';
import { getStationDisplayLabel, formatDisplayOrderNumber } from '@/utils/orderUtils.js';
import type { PrintJob } from '@/types/index.js';

interface JobsTabProps {
  pendingJobs: PrintJob[];
  failedJobs: PrintJob[];
  onRetryJob: (jobId: string) => void;
  onReprintJob: (jobId: string) => void;
  onDeleteJob?: (job: PrintJob) => void;
  onCancelJob?: (job: PrintJob) => void;
}

export const JobsTab: React.FC<JobsTabProps> = ({
  pendingJobs,
  failedJobs,
  onRetryJob,
  onReprintJob,
  onDeleteJob,
  onCancelJob,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'failed'>('failed');
  const [searchQuery, setSearchQuery] = useState('');

  const displayList = activeSubTab === 'failed' ? failedJobs : pendingJobs;
  const filteredList = displayList.filter(
    (j) =>
      formatDisplayOrderNumber(j.orderNumber).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.orderNumber && j.orderNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (j.station && getStationDisplayLabel(j.station).toLowerCase().includes(searchQuery.toLowerCase())) ||
      (j.station && j.station.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (j.errorMessage && j.errorMessage.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleRetryAll = () => {
    for (const job of failedJobs) {
      onRetryJob(job.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Active Queue & Errors</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor real-time print spooling and investigate Windows driver errors.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {activeSubTab === 'failed' && failedJobs.length > 0 && (
            <button
              onClick={handleRetryAll}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry All Failed ({failedJobs.length})</span>
            </button>
          )}

          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveSubTab('failed')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeSubTab === 'failed'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Failed ({failedJobs.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('pending')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeSubTab === 'pending'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>In Queue ({pendingJobs.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Filter by Order # or station name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-orange-500 transition-colors"
        />
      </div>

      {/* List Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 shadow-sm">
        {filteredList.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-200">
              {activeSubTab === 'failed' ? 'Zero Failed Jobs' : 'Queue Is Empty'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {activeSubTab === 'failed'
                ? 'All thermal printer spools are operating smoothly without hardware errors.'
                : 'No pending orders waiting for printing.'}
            </p>
          </div>
        ) : (
          filteredList.map((job) => (
            <div key={job.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors">
              <div className="flex items-start space-x-3.5">
                <div
                  className={`p-2.5 rounded-lg mt-0.5 ${
                    job.jobType === 'KOT'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {job.jobType === 'KOT' ? <FileText className="w-5 h-5" /> : <Printer className="w-5 h-5" />}
                </div>

                <div className="space-y-1">
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
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      Station: {getStationDisplayLabel(job.station)}
                    </span>
                    <span className="text-xs text-slate-500">
                      Attempts: {job.retryCount || 0}
                    </span>
                  </div>

                  {job.errorMessage && (
                    <div className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center space-x-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      <span>{job.errorMessage}</span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500">
                    Received: {new Date(job.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2.5 self-end md:self-center">
                {activeSubTab === 'pending' && onCancelJob && (
                  <button
                    onClick={() => onCancelJob(job)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/50 text-xs font-semibold transition-colors"
                    title="Cancel active queue job"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Cancel Print Job</span>
                  </button>
                )}

                {activeSubTab === 'failed' && (
                  <>
                    <button
                      onClick={() => onRetryJob(job.id)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Print</span>
                    </button>

                    <button
                      onClick={() => onReprintJob(job.id)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition-colors"
                    >
                      <span>Reprint</span>
                    </button>

                    {onDeleteJob && (
                      <button
                        onClick={() => onDeleteJob(job)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-800/40 text-xs font-semibold transition-colors"
                        title="Delete local print record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
