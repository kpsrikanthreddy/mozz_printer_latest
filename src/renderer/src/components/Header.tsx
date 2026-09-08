import React from 'react';
import {
  Printer,
  Wifi,
  WifiOff,
  RefreshCw,
  Minus,
  X,
  Store,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { AgentConnectionStatus, AppSettings } from '@/types/index.js';

interface HeaderProps {
  status: AgentConnectionStatus;
  settings: AppSettings;
  onOpenRegister: () => void;
  onOpenTestPrint: () => void;
  onSimulateOrder?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  settings,
  onOpenRegister,
  onOpenTestPrint,
  onSimulateOrder,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'connected_sse':
        return (
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Wifi className="w-3.5 h-3.5" />
            <span>LIVE (SSE)</span>
          </div>
        );
      case 'connected_polling':
        return (
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse"></span>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>ACTIVE (POLLING)</span>
          </div>
        );
      case 'reconnecting':
        return (
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>RECONNECTING</span>
          </div>
        );
      case 'unauthorized':
        return (
          <button
            onClick={onOpenRegister}
            className="flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>UNLINKED - REGISTER</span>
          </button>
        );
      default:
        return (
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-semibold">
            <WifiOff className="w-3.5 h-3.5" />
            <span>OFFLINE</span>
          </div>
        );
    }
  };

  const handleMinimize = () => {
    if (window.mozzPrinterAPI) {
      window.mozzPrinterAPI.minimizeWindow();
    }
  };

  const handleClose = () => {
    if (window.mozzPrinterAPI) {
      window.mozzPrinterAPI.closeWindow();
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-5 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Brand & Identity */}
      <div className="flex items-center space-x-3.5">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
          <Printer className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base tracking-tight text-white">Mozz Print Agent</span>
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
              Windows POS
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">Thermal KOT & Bill Spooler</p>
        </div>
      </div>

      {/* Middle Status & Branch Info */}
      <div className="flex items-center space-x-3">
        {settings.isRegistered && (
          <div className="flex items-center space-x-2 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs font-medium">
            <Store className="w-3.5 h-3.5 text-orange-400" />
            <span className="truncate max-w-[140px] font-semibold text-slate-200">
              {settings.restaurantName || 'Starters4U'}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400 truncate max-w-[110px]">
              {settings.branchName || 'Main Outlet'}
            </span>
          </div>
        )}

        {getStatusBadge()}

        <button
          onClick={onOpenTestPrint}
          className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white text-xs font-medium transition-colors shadow-sm"
        >
          Quick Test
        </button>

        {onSimulateOrder && (
          <button
            onClick={onSimulateOrder}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-orange-300 hover:text-orange-200 text-xs font-medium transition-colors shadow-sm"
            title="Simulate incoming real-time Cloud POS Order"
          >
            <Zap className="w-3.5 h-3.5 text-orange-400" />
            <span>Simulate Order</span>
          </button>
        )}
      </div>

      {/* Window Controls */}
      <div className="flex items-center space-x-1.5 ml-4">
        <button
          onClick={handleMinimize}
          className="h-8 w-8 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Minimize to Tray"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleClose}
          className="h-8 w-8 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          title="Close / Hide"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
