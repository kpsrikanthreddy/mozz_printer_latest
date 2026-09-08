let ElectronBrowserWindow: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  if (typeof electron === 'object' && electron !== null) {
    ElectronBrowserWindow = electron.BrowserWindow;
  }
} catch {
  // outside electron runtime
}

import { exec } from 'child_process';
import util from 'util';
import type { DiscoveredPrinter } from '../types/index.js';

const execAsync = util.promisify(exec);

export class PrinterManager {
  /**
   * Discovers all printers installed on Windows via Electron webContents and Windows Spooler.
   */
  public async getAvailablePrinters(window?: any): Promise<DiscoveredPrinter[]> {
    const list: DiscoveredPrinter[] = [];

    // 1. Electron WebContents Printer Discovery
    try {
      const targetWindow = window || (ElectronBrowserWindow ? ElectronBrowserWindow.getAllWindows()[0] : null);
      if (targetWindow && targetWindow.webContents) {
        const printers = await targetWindow.webContents.getPrintersAsync();
        for (const p of printers) {
          const raw = p as any;
          list.push({
            name: p.name,
            displayName: p.displayName || p.name,
            description: p.description,
            isDefault: !!raw.isDefault,
            status: raw.status,
            isOnline: raw.status === 0 || raw.status === undefined,
          });
        }
      }
    } catch (err) {
      console.warn('[PrinterManager] Electron getPrintersAsync failed, trying fallback:', err);
    }

    // 2. Windows PowerShell Spooler fallback if Electron returned empty
    if (list.length === 0 && process.platform === 'win32') {
      try {
        const { stdout } = await execAsync(
          'powershell -NoProfile -Command "Get-Printer | Select-Object Name, Default, PrinterStatus | ConvertTo-Json"'
        );
        const parsed = JSON.parse(stdout);
        const array = Array.isArray(parsed) ? parsed : [parsed];
        for (const p of array) {
          if (p && p.Name) {
            list.push({
              name: p.Name,
              displayName: p.Name,
              isDefault: !!p.Default,
              status: p.PrinterStatus,
              isOnline: p.PrinterStatus === 'Normal' || p.PrinterStatus === 0,
            });
          }
        }
      } catch (err) {
        console.warn('[PrinterManager] PowerShell printer discovery error:', err);
      }
    }

    // 3. Always include Mock Thermal Printer for testing and development environments
    list.unshift({
      name: 'MOCK_PRINTER',
      displayName: 'Virtual Thermal POS (Mock / Dev Mode)',
      description: 'Emulates 58mm/80mm thermal receipt printing without physical hardware',
      isDefault: list.length === 0,
      isOnline: true,
    });

    return list;
  }

  /**
   * Checks detailed Windows printer spooler health (paper out, door open, offline).
   */
  public async checkPrinterSpoolerHealth(printerName: string): Promise<{ isOnline: boolean; error?: string }> {
    if (printerName === 'MOCK_PRINTER') return { isOnline: true };
    if (process.platform !== 'win32') return { isOnline: true };

    try {
      const sanitized = printerName.replace(/["';`$]/g, '');
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-Printer -Name '${sanitized}' -ErrorAction SilentlyContinue | Select-Object Name, PrinterStatus, PortName | ConvertTo-Json"`
      );
      if (!stdout || !stdout.trim()) {
        return { isOnline: false, error: `Printer "${printerName}" not found in Windows Spooler.` };
      }
      const parsed = JSON.parse(stdout);
      const status = String(parsed.PrinterStatus || '').toLowerCase();
      if (status.includes('offline')) {
        return { isOnline: false, error: `[PRINTER_OFFLINE] Printer "${printerName}" is marked Offline in Windows Spooler. Check cable/power.` };
      }
      if (status.includes('paused')) {
        return { isOnline: false, error: `[PRINTER_PAUSED] Printer "${printerName}" is paused in Windows Spooler. Resume printer in Windows Settings.` };
      }
      if (status.includes('paperout') || status.includes('paper out')) {
        return { isOnline: false, error: `[PAPER_OUT] Printer "${printerName}" is out of paper in Windows Spooler.` };
      }
      if (status.includes('error')) {
        return { isOnline: false, error: `[SPOOLER_ERROR] Windows Spooler reported driver error on printer "${printerName}".` };
      }
      return { isOnline: true };
    } catch {
      return { isOnline: true }; // Fallback to optimistic submission
    }
  }

  /**
   * Verifies if a given printer name is available on the system.
   */
  public async isPrinterAvailable(printerName: string, window?: any): Promise<boolean> {
    if (printerName === 'MOCK_PRINTER') return true;
    const printers = await this.getAvailablePrinters(window);
    return printers.some((p) => p.name.toLowerCase() === printerName.toLowerCase());
  }
}

export const printerManager = new PrinterManager();
