import React, { useState } from 'react';
import { X, ShieldCheck, Server, Laptop, AlertCircle, KeyRound, Sparkles, Sliders } from 'lucide-react';
import type { AppSettings } from '@/types/index.js';

interface DeviceAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onPairWithCode: (payload: {
    apiUrl: string;
    pairingCode: string;
    deviceName?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onRegister: (payload: {
    apiUrl: string;
    restaurantId: string;
    branchId: string;
    deviceId: string;
    deviceName: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const DeviceAuthModal: React.FC<DeviceAuthModalProps> = ({
  isOpen,
  onClose,
  settings,
  onPairWithCode,
  onRegister,
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'manual'>('code');

  // Code form
  const [codeForm, setCodeForm] = useState({
    apiUrl: settings.apiUrl || 'https://www.starters4u.in',
    pairingCode: '',
    deviceName: settings.deviceName || 'Windows POS Terminal 01',
  });

  // Manual form
  const [manualForm, setManualForm] = useState({
    apiUrl: settings.apiUrl || 'https://www.starters4u.in',
    restaurantId: settings.restaurantId || 'starters4u_main',
    branchId: settings.branchId || 'branch_madhapur',
    deviceId: settings.deviceId || `win-pos-${Math.random().toString(36).substring(2, 7)}`,
    deviceName: settings.deviceName || 'Windows POS Terminal 01',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codeForm.pairingCode.trim().length !== 6) {
      setErrorMsg('Please enter a valid 6-digit registration code.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await onPairWithCode({
        apiUrl: codeForm.apiUrl.trim(),
        pairingCode: codeForm.pairingCode.trim(),
        deviceName: codeForm.deviceName.trim(),
      });
      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to pair device using this registration code.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during device pairing.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await onRegister(manualForm);
      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to link device with Starters4U backend.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during registration.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Pair Terminal with Starters4U</h3>
              <p className="text-[11px] text-slate-400">Authenticate this physical Windows POS station</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 p-1 gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('code');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'code'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>6-Digit Pairing Code (Recommended)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('manual');
              setErrorMsg(null);
            }}
            className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'manual'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Manual Setup</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 6-DIGIT PAIRING CODE TAB */}
        {activeTab === 'code' ? (
          <form onSubmit={handlePairSubmit} className="p-6 space-y-4">
            <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 text-center">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Enter 6-Digit Registration Code
              </label>
              <p className="text-[11px] text-slate-400 mb-3">
                Log into Starters4U Admin Dashboard &gt; POS Settings &gt; Generate Pairing Code (10 min TTL)
              </p>
              <input
                type="text"
                required
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="• • • • • •"
                value={codeForm.pairingCode}
                onChange={(e) =>
                  setCodeForm({
                    ...codeForm,
                    pairingCode: e.target.value.replace(/\D/g, '').slice(0, 6),
                  })
                }
                className="w-48 mx-auto text-center py-2.5 px-4 text-2xl font-mono tracking-widest font-bold rounded-xl bg-slate-900 border border-orange-500/50 text-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                POS Terminal Friendly Name
              </label>
              <div className="relative">
                <Laptop className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="e.g., Billing Counter Counter 1 or Kitchen Master"
                  value={codeForm.deviceName}
                  onChange={(e) => setCodeForm({ ...codeForm, deviceName: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Backend Server URL
              </label>
              <div className="relative">
                <Server className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={codeForm.apiUrl}
                  onChange={(e) => setCodeForm({ ...codeForm, apiUrl: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || codeForm.pairingCode.length !== 6}
                className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all shadow-lg shadow-orange-950 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Verifying Code...' : 'Connect & Authorize'}</span>
              </button>
            </div>
          </form>
        ) : (
          /* MANUAL TAB */
          <form onSubmit={handleManualSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Backend Server URL
              </label>
              <div className="relative">
                <Server className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={manualForm.apiUrl}
                  onChange={(e) => setManualForm({ ...manualForm, apiUrl: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Restaurant ID
                </label>
                <input
                  type="text"
                  required
                  value={manualForm.restaurantId}
                  onChange={(e) => setManualForm({ ...manualForm, restaurantId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Branch ID
                </label>
                <input
                  type="text"
                  required
                  value={manualForm.branchId}
                  onChange={(e) => setManualForm({ ...manualForm, branchId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                POS Terminal Device Name
              </label>
              <div className="relative">
                <Laptop className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={manualForm.deviceName}
                  onChange={(e) => setManualForm({ ...manualForm, deviceName: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all shadow-lg shadow-orange-950 disabled:opacity-50"
              >
                {isLoading ? 'Linking...' : 'Save & Link Terminal'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
