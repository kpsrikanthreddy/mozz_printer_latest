import React, { useState } from 'react';
import { X, Printer, FileText, CheckCircle2, AlertTriangle, Send } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal.js';
import type {
  PrinterConfig,
  PrintJobType,
  PrinterStation,
  PaperWidthMm,
  DiscoveredPrinter,
} from '@/types/index.js';

interface TestPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  printerConfigs: PrinterConfig[];
  discoveredPrinters: DiscoveredPrinter[];
  onTriggerTestPrint: (payload: {
    type: PrintJobType;
    station: PrinterStation;
    paperWidthMm: PaperWidthMm;
    customPrinterName?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const TestPrintModal: React.FC<TestPrintModalProps> = ({
  isOpen,
  onClose,
  printerConfigs,
  discoveredPrinters,
  onTriggerTestPrint,
}) => {
  const [ticketType, setTicketType] = useState<PrintJobType>('KOT');
  const [selectedStation, setSelectedStation] = useState<PrinterStation>('kitchen_master');
  const [paperWidth, setPaperWidth] = useState<PaperWidthMm>(80);
  const [targetPrinter, setTargetPrinter] = useState<string>('MOCK_PRINTER');
  const [isPrinting, setIsPrinting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  if (!isOpen) return null;

  const isBrowserPreview =
    typeof window !== 'undefined' &&
    (!window.mozzPrinterAPI?.isElectron || !!window.mozzPrinterAPI?.isBrowserPreview);

  const isPrintDisabled = isBrowserPreview;

  const handleStationChange = (st: PrinterStation) => {
    setSelectedStation(st);
    const existing = printerConfigs.find((c) => c.station === st);
    if (existing) {
      setPaperWidth(existing.paperWidthMm);
      setTargetPrinter(existing.printerName);
    }
  };

  const executePrint = async () => {
    if (isPrintDisabled) {
      setResult({
        success: false,
        message: 'Preview mode — test actions are disabled. Available only in the installed Windows Print Agent.',
      });
      return;
    }

    setIsPrinting(true);
    setResult(null);

    try {
      const res = await onTriggerTestPrint({
        type: ticketType,
        station: selectedStation,
        paperWidthMm: paperWidth,
        customPrinterName: targetPrinter,
      });

      if (res.success) {
        setResult({
          success: true,
          message: `Successfully printed test ${ticketType} via "${targetPrinter}". Spool verified!`,
        });
      } else {
        setResult({
          success: false,
          message: res.error || 'Printing failed. Check printer connection and drivers.',
        });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Driver error' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintRequest = () => {
    if (isPrintDisabled) {
      executePrint();
      return;
    }
    setShowConfirmDialog(true);
  };

  // Build printer list ensuring Canon G3010 series is included
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Generate Test Ticket</h3>
              <p className="text-[11px] text-slate-400">Validate 58mm / 80mm thermal layout & driver spools</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Browser Preview Restriction Alert */}
          {isBrowserPreview && (
            <div
              id="modal-browser-preview-notice"
              className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs flex items-start space-x-3"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300">Browser preview—physical printing unavailable</strong>
                <p className="text-[11px] text-amber-200/80 mt-0.5">
                  Physical printing works only inside the packaged Electron desktop application. In this web preview, select <strong>Mock Virtual Thermal Spooler</strong> to test ticket generation.
                </p>
              </div>
            </div>
          )}

          {result && (
            <div
              id="modal-test-print-result"
              className={`p-3 rounded-lg border text-xs flex items-center space-x-2.5 ${
                result.success
                  ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800/40 text-rose-300'
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="font-medium">{result.message}</span>
            </div>
          )}

          {/* Ticket Type Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <button
              id="btn-ticket-type-kot"
              type="button"
              onClick={() => {
                setTicketType('KOT');
                handleStationChange('kitchen_master');
              }}
              className={`p-3.5 rounded-xl border flex items-center space-x-3 transition-all ${
                ticketType === 'KOT'
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-5 h-5" />
              <div className="text-left">
                <p className="text-xs font-bold">Kitchen Order Ticket (KOT)</p>
                <p className="text-[10px] text-slate-400">Items, shapes, crusts, and station prep notes</p>
              </div>
            </button>

            <button
              id="btn-ticket-type-bill"
              type="button"
              onClick={() => {
                setTicketType('BILL');
                handleStationChange('billing');
              }}
              className={`p-3.5 rounded-xl border flex items-center space-x-3 transition-all ${
                ticketType === 'BILL'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Printer className="w-5 h-5" />
              <div className="text-left">
                <p className="text-xs font-bold">Customer Bill / Receipt</p>
                <p className="text-[10px] text-slate-400">Tax summary, GST, payment, and totals</p>
              </div>
            </button>
          </div>

          {/* Options Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Target Station
              </label>
              <select
                id="modal-select-station"
                value={selectedStation}
                onChange={(e) => handleStationChange(e.target.value as PrinterStation)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-orange-500"
              >
                <option value="billing">Billing Counter</option>
                <option value="kitchen_master">Kitchen Master</option>
                <option value="kitchen_pizza">Pizza Section</option>
                <option value="bar_beverage">Chinese Special</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Paper Profile
              </label>
              <select
                id="modal-select-paper"
                value={paperWidth}
                onChange={(e) =>
                  setPaperWidth(
                    e.target.value === 'A4_TEST'
                      ? 'A4_TEST'
                      : (parseInt(e.target.value, 10) as PaperWidthMm)
                  )
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-orange-500"
              >
                <option value={80}>80mm (Standard POS)</option>
                <option value={58}>58mm (Compact)</option>
                <option value="A4_TEST">A4 Test Only (Canon G3010)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Printer Driver
              </label>
              <select
                id="modal-select-printer"
                value={targetPrinter}
                onChange={(e) => setTargetPrinter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-orange-500"
              >
                {printerOptions.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName} {p.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Visual Thermal Receipt Preview */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Receipt Preview ({paperWidth === 'A4_TEST' ? 'A4 Test Sheet - Top-Left on Canon G3010' : `${paperWidth}mm Continuous Thermal`})
            </label>
            <div className="flex justify-center p-4 rounded-xl bg-slate-950 border border-slate-800">
              {paperWidth === 'A4_TEST' ? (
                <div className="w-full max-w-[360px] bg-slate-200/90 rounded border-2 border-slate-400 p-2 text-[10px] text-slate-600 shadow-inner">
                  <div className="flex justify-between items-center mb-1.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                    <span>A4 Paper (Top-Left Alignment)</span>
                    <span className="bg-slate-300 px-1.5 py-0.5 rounded text-[8px]">Canon G3010 Driver</span>
                  </div>
                  <div
                    style={{ width: '270px' }}
                    className="bg-white text-black p-3.5 shadow-md font-mono text-[11px] leading-tight border-r-2 border-b-2 border-dashed border-slate-400"
                  >
                    <div className="text-center font-bold text-[10px] bg-slate-100 border border-dashed border-slate-400 p-1 mb-2">
                      [ A4 TEST PRINT - CANON G3010 (TOP-LEFT) ]
                    </div>
                    <div className="text-center font-bold text-sm tracking-wider">STARTERS4U</div>
                    <div className="text-center text-[10px]">Madhapur, Hyderabad</div>
                    <div className="border-b border-dashed border-black my-1.5"></div>

                    {ticketType === 'KOT' ? (
                      <>
                        <div className="flex justify-between font-bold">
                          <span>KOT: #TEST-01</span>
                          <span>DINE IN</span>
                        </div>
                        <div className="text-center font-bold text-base py-1 border-y-2 border-black my-1">
                          TABLE: T-07
                        </div>
                        <div className="font-bold my-1">ITEMS:</div>
                        <div className="border-b border-dashed border-black pb-1 mb-1">
                          <div className="flex justify-between font-bold">
                            <span>Margherita Pocket Pizza</span>
                            <span>[x2]</span>
                          </div>
                          <div className="text-[9px] text-gray-700">Shape: Korean Rectangle | Pocket Crust</div>
                          <div className="text-[9px] font-bold">* Crispy crust please</div>
                        </div>
                        <div className="border-b border-dashed border-black pb-1 mb-1">
                          <div className="flex justify-between font-bold">
                            <span>Peri Peri Fries</span>
                            <span>[x1]</span>
                          </div>
                          <div className="text-[9px] text-gray-700">+ Extra Cheese Dip</div>
                        </div>
                        <div className="text-center text-[9px] mt-2">--- END OF TICKET ---</div>
                        <div className="text-center text-[8px] text-slate-500 mt-1">✂ CUT ALONG DASHED LINE ✂</div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between font-bold">
                          <span>INV: TEST-2026-01</span>
                          <span>#TEST-101</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span>Table: T-07</span>
                          <span>14:30:22</span>
                        </div>
                        <div className="border-b border-dashed border-black my-1.5"></div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>2x Margherita Pizza</span>
                            <span>₹498.00</span>
                          </div>
                          <div className="flex justify-between">
                            <span>1x Peri Peri Fries</span>
                            <span>₹129.00</span>
                          </div>
                        </div>
                        <div className="border-b border-dashed border-black my-1.5"></div>
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span>₹627.00</span>
                        </div>
                        <div className="flex justify-between text-gray-700">
                          <span>Discount:</span>
                          <span>- ₹50.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span>GST (5%):</span>
                          <span>₹28.85</span>
                        </div>
                        <div className="border-b-2 border-black my-1.5"></div>
                        <div className="flex justify-between font-bold text-xs">
                          <span>TOTAL:</span>
                          <span>₹605.85</span>
                        </div>
                        <div className="border-b-2 border-black my-1.5"></div>
                        <div className="text-center text-[9px] mt-1">Thank you! Visit again.</div>
                        <div className="text-center text-[8px] text-slate-500 mt-1">✂ CUT ALONG DASHED LINE ✂</div>
                      </>
                    )}
                  </div>
                  <div className="mt-2 text-center text-[9px] italic text-slate-500">
                    Remaining A4 sheet area remains blank for easy cut-out
                  </div>
                </div>
              ) : (
                <div
                  style={{ width: paperWidth === 58 ? '190px' : '270px' }}
                  className="bg-white text-black p-3.5 shadow-lg rounded font-mono text-[11px] leading-tight border border-slate-300"
                >
                  <div className="text-center font-bold text-xs bg-black text-white py-1 px-2 mb-2 rounded-xs">
                    *** TEST PRINT — NOT A CUSTOMER ORDER ***
                  </div>
                  <div className="text-center font-bold text-sm tracking-wider">STARTERS4U</div>
                  <div className="text-center text-[10px]">Madhapur, Hyderabad</div>
                  <div className="border-b border-dashed border-black my-1.5"></div>

                  {ticketType === 'KOT' ? (
                    <>
                      <div className="flex justify-between font-bold">
                        <span>KOT: #TEST-01</span>
                        <span>DINE IN</span>
                      </div>
                      <div className="text-center font-bold text-base py-1 border-y-2 border-black my-1">
                        TABLE: T-07
                      </div>
                      <div className="font-bold my-1">ITEMS:</div>
                      <div className="border-b border-dashed border-black pb-1 mb-1">
                        <div className="flex justify-between font-bold">
                          <span>Margherita Pocket Pizza</span>
                          <span>[x2]</span>
                        </div>
                        <div className="text-[9px] text-gray-700">Shape: Korean Rectangle | Pocket Crust</div>
                        <div className="text-[9px] font-bold">* Crispy crust please</div>
                      </div>
                      <div className="border-b border-dashed border-black pb-1 mb-1">
                        <div className="flex justify-between font-bold">
                          <span>Peri Peri Fries</span>
                          <span>[x1]</span>
                        </div>
                        <div className="text-[9px] text-gray-700">+ Extra Cheese Dip</div>
                      </div>
                      <div className="text-center text-[9px] mt-2">--- END OF TICKET ---</div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between font-bold">
                        <span>INV: TEST-2026-01</span>
                        <span>#TEST-101</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span>Table: T-07</span>
                        <span>14:30:22</span>
                      </div>
                      <div className="border-b border-dashed border-black my-1.5"></div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>2x Margherita Pizza</span>
                          <span>₹498.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span>1x Peri Peri Fries</span>
                          <span>₹129.00</span>
                        </div>
                      </div>
                      <div className="border-b border-dashed border-black my-1.5"></div>
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>₹627.00</span>
                      </div>
                      <div className="flex justify-between text-gray-700">
                        <span>Discount:</span>
                        <span>- ₹50.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST (5%):</span>
                        <span>₹28.85</span>
                      </div>
                      <div className="border-b-2 border-black my-1.5"></div>
                      <div className="flex justify-between font-bold text-xs">
                        <span>TOTAL:</span>
                        <span>₹605.85</span>
                      </div>
                      <div className="border-b-2 border-black my-1.5"></div>
                      <div className="text-center text-[9px] mt-1">Thank you! Visit again.</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60">
          <div className="text-xs text-slate-400">
            Target Driver:{' '}
            <strong className="text-slate-200 font-mono">
              {targetPrinter === 'MOCK_PRINTER' ? 'Virtual Thermal (Mock Mode)' : targetPrinter}
            </strong>
          </div>

          <div className="flex items-center space-x-3">
            <button
              id="modal-btn-close"
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Close
            </button>
            <button
              id="modal-btn-send-test"
              type="button"
              onClick={handlePrintRequest}
              disabled={isPrinting || isPrintDisabled}
              title={
                isPrintDisabled
                  ? 'Available only in the installed Windows Print Agent.'
                  : 'Send test ticket to selected printer'
              }
              className={`flex items-center space-x-1.5 px-5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isPrintDisabled
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-600/20 disabled:opacity-50'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isPrinting ? 'Sending to Spooler...' : 'Send Test Print'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog before printing test ticket */}
      <ConfirmationModal
        isOpen={showConfirmDialog}
        title="Confirm Test Print"
        message={`This will print a test page to ${targetPrinter}. Continue?`}
        subtitle="Manual Production Diagnostic"
        warningNotice="Test jobs remain strictly local to this Windows workstation and will never be transmitted to the backend API or customer order history."
        confirmLabel="Continue"
        cancelLabel="Cancel"
        isDestructive={false}
        iconType="printer"
        onConfirm={async () => {
          setShowConfirmDialog(false);
          await executePrint();
        }}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </div>
  );
};
