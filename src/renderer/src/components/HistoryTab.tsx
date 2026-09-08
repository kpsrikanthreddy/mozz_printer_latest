import React, { useState } from 'react';
import {
  History,
  Search,
  RotateCcw,
  Trash2,
  Printer,
  FileText,
  Filter,
} from 'lucide-react';
import type { PrintJob } from '@/types/index.js';

interface HistoryTabProps {
  historyJobs: PrintJob[];
  onReprintJob: (jobId: string) => void;
  onClearCompleted: () => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  historyJobs,
  onReprintJob,
  onClearCompleted,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'KOT' | 'BILL'>('ALL');

  const filtered = historyJobs.filter((j) => {
    const matchesSearch =
      j.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      (j.station && j.station.toLowerCase().includes(search.toLowerCase())) ||
      j.id.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'ALL' || j.jobType === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Print History & Audit</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit log of all processed thermal receipts, bills, and kitchen tickets.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onClearCompleted}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-800/40 text-xs font-semibold transition-colors"
            title="Cleans completed jobs from view while retaining idempotency protection"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purge View</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by order number or station..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-lg">
            {(['ALL', 'KOT', 'BILL'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  typeFilter === t
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table / List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Station</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No history matching your criteria
                  </td>
                </tr>
              ) : (
                filtered.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">
                      <div className="flex items-center space-x-2">
                        {job.jobType === 'KOT' ? (
                          <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                        <span>#{job.orderNumber}</span>
                        {job.isReprint && (
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Reprint
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                          job.jobType === 'KOT'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                        }`}
                      >
                        {job.jobType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">
                      {job.station || 'Default'}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(job.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          job.status === 'PRINTED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : job.status === 'FAILED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onReprintJob(job.id)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reprint</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
