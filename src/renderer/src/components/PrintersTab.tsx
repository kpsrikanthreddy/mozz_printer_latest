import React, { useState } from 'react';
import {
  Printer,
  RefreshCw,
  Save,
  Check,
  Utensils,
  Receipt,
  Coffee,
  Flame,
  AlertTriangle,
  Info,
} from 'lucide-react';
import type {
  PrinterConfig,
  DiscoveredPrinter,
  PrinterStation,
  PaperWidthMm,
} from '@/types/index.js';

interface PrintersTabProps {
  discoveredPrinters: DiscoveredPrinter[];
  printerConfigs: PrinterConfig[];
  onRefreshPrinters: () => Promise<void>;
  onSaveConfig: (config: PrinterConfig) => Promise<void>;
  onTestPrint: (station: PrinterStation, paperWidth: PaperWidthMm, printerName: string) => Promise<void>;
}

export const PrintersTab: React.FC<PrintersTabProps> = ({
  discoveredPrinters,
  printerConfigs,
  onRefreshPrinters,
  onSaveConfig,
  onTestPrint,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savedStation, setSavedStation] = useState<string | null>(null);
  const [testingStation, setTestingStation] = useState<string | null>(null);

  const [localConfigs, setLocalConfigs] = useState<Record<string, PrinterConfig>>(() => {
    const map: Record<string, PrinterConfig> = {};
    for (const c of printerConfigs) {
      map[c.station] = { ...c };
    }
    return map;
  });

  const isBrowserPreview =
    typeof window !== 'undefined' &&
    (!window.mozzPrinterAPI?.isElectron || !!window.mozzPrinterAPI?.isBrowserPreview);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshPrinters();
    } finally {
      setIsRefreshing(false);
    }
  };

  const updateConfigField = (station: PrinterStation, field: keyof PrinterConfig, value: any) => {
    setLocalConfigs((prev) => {
      const existing = prev[station] || {
        station,
        printerName: 'MOCK_PRINTER',
        paperWidthMm: 80,
        copies: 1,
        isAutoPrint: true,
      };
      return {
        ...prev,
        [station]: {
          ...existing,
          [field]: value,
        },
      };
    });
  };

  const handleSave = async (station: PrinterStation) => {
    const config = localConfigs[station];
    if (config) {
      await onSaveConfig(config);
      setSavedStation(station);
      setTimeout(() => setSavedStation(null), 2000);
    }
  };

  const handleTestPrintClick = async (station: PrinterStation, paperWidth: PaperWidthMm, printerName: string) => {
    setTestingStation(station);
    try {
      await onTestPrint(station, paperWidth, printerName);
    } finally {
      setTestingStation(null);
    }
  };

  // Build full options list ensuring "Canon G3010 series" is always selectable
  const printerOptions = [...discoveredPrinters];
  if (!printerOptions.some((p) => p.name.toLowerCase().includes('canon g3010'))) {
    printerOptions.push({
      name: 'Canon G3010 series',
      displayName: 'Canon G3010 series',
      description: 'Canon G3010 Series Windows Driver (A4 Diagnostics)',
      isDefault: false,
      isOnline: true,
    });
  }

  const STATIONS_METADATA: {
    station: PrinterStation;
    title: string;
    description: string;
    type: 'KOT' | 'BILL';
    icon: React.ReactNode;
    defaultPaper: PaperWidthMm;
  }[] = [
    {
      station: 'billing',
      title: 'Billing Counter (Customer Receipts)',
      description: 'Customer tax receipts, GST summaries, payment slips, and invoices.',
      type: 'BILL',
      icon: <Receipt className="w-5 h-5 text-emerald-400" />,
      defaultPaper: 80,
    },
    {
      station: 'kitchen_master',
      title: 'Kitchen Master (Main KOT)',
      description: 'Master order tickets for executive kitchen prep and main cook line.',
      type: 'KOT',
      icon: <Utensils className="w-5 h-5 text-amber-400" />,
      defaultPaper: 80,
    },
    {
      station: 'kitchen_pizza',
      title: 'Pizza Section (Pocket Pizzas)',
      description: 'Dedicated tickets for pizza assembly, crust selection, and oven timing.',
      type: 'KOT',
      icon: <Flame className="w-5 h-5 text-orange-400" />,
      defaultPaper: 58,
    },
    {
      station: 'bar_beverage',
      title: 'Chinese Special',
      description: 'Chinese dishes, noodles, fried rice, manchurian, and wok tickets.',
      type: 'KOT',
      icon: <Utensils className="w-5 h-5 text-cyan-400" />,
      defaultPaper: 58,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Browser Preview Restriction Banner */}
      {isBrowserPreview && (
        <div
          id="banner-browser-preview-notice"
          className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-start sm:items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-300">
                Browser preview—physical printing unavailable
              </h4>
              <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                Physical printing functions exclusively inside the packaged Electron desktop application. Physical Test Print buttons are disabled in this web preview. Use “Mock Virtual Thermal Spooler” for virtual simulations.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-center px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold uppercase tracking-wider shrink-0">
            Physical Printing Disabled
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Thermal Station Printers</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Discover Windows drivers via getPrintersAsync() and map stations to 58mm, 80mm, or Canon G3010 A4 test profiles.
          </p>
        </div>

        <button
          id="btn-refresh-printers"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Printers</span>
        </button>
      </div>

      {/* Discovered Printers Info Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2 text-slate-300">
          <Printer className="w-4 h-4 text-orange-400 shrink-0" />
          <span>
            Discovered <strong>{discoveredPrinters.length}</strong> available Windows printer drivers (including Canon G3010 series & thermal spoolers).
          </span>
        </div>
        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
          <Info className="w-3.5 h-3.5 text-blue-400" />
          <span>Save Config required before testing</span>
        </div>
      </div>

      {/* Station Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {STATIONS_METADATA.map((meta) => {
          const config = localConfigs[meta.station] || {
            station: meta.station,
            printerName: 'MOCK_PRINTER',
            paperWidthMm: meta.defaultPaper,
            copies: 1,
            isAutoPrint: true,
          };

          const savedConfig = printerConfigs.find((c) => c.station === meta.station);
          // Check if config has unsaved changes
          const hasUnsavedChanges =
            !savedConfig ||
            savedConfig.printerName !== config.printerName ||
            savedConfig.paperWidthMm !== config.paperWidthMm ||
            savedConfig.copies !== config.copies ||
            savedConfig.isAutoPrint !== config.isAutoPrint;

          const isSaved = savedStation === meta.station;
          const isPhysicalPrinter = config.printerName !== 'MOCK_PRINTER';
          const isPhysicalDisabled = isBrowserPreview && isPhysicalPrinter;
          const isTesting = testingStation === meta.station;

          return (
            <div
              key={meta.station}
              id={`station-card-${meta.station}`}
              className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-4 shadow-sm"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
                    {meta.icon}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-white">{meta.title}</h3>
                      {hasUnsavedChanges && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                          Unsaved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {meta.type}
                </span>
              </div>

              {/* Form Controls */}
              <div className="space-y-3 pt-2">
                {/* Printer Select */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Windows Printer Driver
                    </label>
                    {config.printerName.toLowerCase().includes('canon g3010') && (
                      <span className="text-[10px] text-cyan-400 font-semibold">
                        Canon Inkjet Driver
                      </span>
                    )}
                  </div>
                  <select
                    id={`select-printer-${meta.station}`}
                    value={config.printerName}
                    onChange={(e) => updateConfigField(meta.station, 'printerName', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-orange-500"
                  >
                    {printerOptions.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName} {p.isDefault ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Paper Width & Copies */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Paper Profile
                    </label>
                    <select
                      id={`select-paper-${meta.station}`}
                      value={config.paperWidthMm}
                      onChange={(e) =>
                        updateConfigField(
                          meta.station,
                          'paperWidthMm',
                          e.target.value === 'A4_TEST'
                            ? 'A4_TEST'
                            : (parseInt(e.target.value, 10) as PaperWidthMm)
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-orange-500"
                    >
                      <option value={80}>80mm (Standard Thermal POS)</option>
                      <option value={58}>58mm (Compact KOT)</option>
                      <option value="A4_TEST">A4 Test Only (Canon G3010)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Copies
                    </label>
                    <select
                      id={`select-copies-${meta.station}`}
                      value={config.copies}
                      onChange={(e) =>
                        updateConfigField(meta.station, 'copies', parseInt(e.target.value, 10))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-orange-500"
                    >
                      <option value={1}>1 copy</option>
                      <option value={2}>2 copies</option>
                      <option value={3}>3 copies</option>
                    </select>
                  </div>
                </div>

                {/* Auto Print Toggle */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-300 font-medium">Automatic Silent Spooling</span>
                  <input
                    id={`toggle-autoprint-${meta.station}`}
                    type="checkbox"
                    checked={config.isAutoPrint}
                    onChange={(e) => updateConfigField(meta.station, 'isAutoPrint', e.target.checked)}
                    className="w-4 h-4 rounded text-orange-600 bg-slate-950 border-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </div>
              </div>

              {/* Status Hint */}
              {hasUnsavedChanges ? (
                <div className="p-2 rounded bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>Click <strong>Save Config</strong> below before testing this printer.</span>
                </div>
              ) : isPhysicalDisabled ? (
                <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center space-x-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>Physical printing disabled in browser preview.</span>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  id={`btn-test-print-${meta.station}`}
                  type="button"
                  onClick={() => handleTestPrintClick(meta.station, config.paperWidthMm, config.printerName)}
                  disabled={hasUnsavedChanges || isPhysicalDisabled || isTesting}
                  title={
                    hasUnsavedChanges
                      ? 'Please save configuration before testing'
                      : isPhysicalDisabled
                      ? 'Browser preview—physical printing unavailable'
                      : 'Trigger a test ticket to verify driver spool'
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    hasUnsavedChanges || isPhysicalDisabled
                      ? 'bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm'
                  }`}
                >
                  {isTesting
                    ? 'Testing...'
                    : hasUnsavedChanges
                    ? 'Save Config to Test'
                    : isPhysicalDisabled
                    ? 'Browser Preview (Physical Disabled)'
                    : 'Test Print'}
                </button>

                <button
                  id={`btn-save-config-${meta.station}`}
                  type="button"
                  onClick={() => handleSave(meta.station)}
                  className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isSaved
                      ? 'bg-emerald-600 text-white'
                      : 'bg-orange-600 hover:bg-orange-500 text-white shadow-sm'
                  }`}
                >
                  {isSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isSaved ? 'Saved Locally' : 'Save Config'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
