import type { KotTicketPayload, BillTicketPayload, PaperWidthMm } from '../types/index.js';
import { formatDisplayOrderNumber, formatStationHeading } from '../utils/orderUtils.js';

/**
 * Generates an isolated HTML page formatted specifically for thermal printer drivers.
 * Supports 58mm (approx 204px / 48mm printable) and 80mm (approx 280px / 72mm printable).
 */
export function generateKotHtml(payload: KotTicketPayload, paperWidthMm: PaperWidthMm = 80): string {
  const is58 = paperWidthMm === 58;
  const isA4Test = paperWidthMm === 'A4_TEST';
  const widthPx = is58 ? '190px' : isA4Test ? '280px' : '270px';
  const fontSize = is58 ? '12px' : '13px';
  const headerFontSize = is58 ? '16px' : '18px';
  const tableFontSize = is58 ? '18px' : '22px';

  const formattedTime = new Date(payload.orderTime).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const formattedDate = new Date(payload.orderTime).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const itemsHtml = payload.items
    .map((item) => {
      const addonsText = item.addons && item.addons.length > 0 ? `+ ${item.addons.join(', ')}` : '';
      const notesText = item.specialInstructions ? `Note: ${item.specialInstructions}` : '';
      const shapeCrust = [item.selectedShape ? `Shape: ${item.selectedShape}` : '', item.selectedCrust, item.spiceLevel]
        .filter(Boolean)
        .join(' | ');

      return `
        <div style="border-bottom: 1.5px dashed #000000; padding: 4px 0; margin-bottom: 4px; color: #000000 !important;">
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: ${is58 ? '12px' : '14px'}; color: #000000 !important;">
            <span style="flex: 1; word-break: break-word; font-weight: bold; color: #000000 !important;">${item.name}</span>
            <span style="font-size: ${is58 ? '14px' : '16px'}; min-width: 28px; text-align: right; font-weight: bold; color: #000000 !important;">[ x${item.quantity} ]</span>
          </div>
          ${shapeCrust ? `<div style="font-size: ${is58 ? '10px' : '12px'}; font-weight: bold; color: #000000 !important; margin-top: 2px;">${shapeCrust}</div>` : ''}
          ${addonsText ? `<div style="font-size: ${is58 ? '10px' : '12px'}; font-weight: bold; color: #000000 !important;">${addonsText}</div>` : ''}
          ${notesText ? `<div style="font-size: ${is58 ? '10px' : '12px'}; font-style: italic; font-weight: bold; margin-top: 1px; color: #000000 !important;">* ${notesText}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>KOT - ${payload.kotNumber}</title>
        <style>
          @page {
            margin: ${isA4Test ? '5mm' : '0'};
            size: ${isA4Test ? 'A4 portrait' : is58 ? '58mm auto' : '80mm auto'};
          }
          * {
            color: #000000 !important;
            opacity: 1 !important;
            font-weight: bold !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            margin: 0;
            padding: ${isA4Test ? '6px 10px' : '2px 4px'};
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${fontSize};
            font-weight: bold !important;
            line-height: 1.3;
            color: #000000 !important;
            background: #ffffff !important;
            width: ${widthPx};
            max-width: ${widthPx};
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            opacity: 1 !important;
            page-break-inside: avoid;
            text-rendering: geometricPrecision;
            ${isA4Test ? 'border-right: 1px dashed #777; border-bottom: 1px dashed #777; padding-bottom: 16px;' : ''}
          }
          .center { text-align: center; color: #000000 !important; font-weight: bold !important; }
          .bold { font-weight: bold !important; color: #000000 !important; }
          .divider { border-bottom: 1.5px dashed #000000; margin: 4px 0; }
          .double-divider { border-bottom: 2px solid #000000; margin: 5px 0; }
          .reprint-banner {
            border: 2px solid #000000;
            padding: 3px;
            text-align: center;
            font-weight: bold !important;
            font-size: ${headerFontSize};
            margin-bottom: 4px;
            letter-spacing: 1px;
            color: #000000 !important;
          }
          .a4-test-banner {
            border: 1.5px dashed #000000;
            background: #ffffff;
            padding: 4px;
            text-align: center;
            font-weight: bold !important;
            font-size: 10px;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
            color: #000000 !important;
          }
          .test-print-banner {
            border: 2px solid #000000;
            padding: 4px;
            text-align: center;
            font-weight: bold !important;
            font-size: ${is58 ? '10px' : '11px'};
            margin-bottom: 6px;
            letter-spacing: 0.5px;
            background: #ffffff;
            color: #000000 !important;
          }
        </style>
      </head>
      <body>
        ${isA4Test ? '<div class="a4-test-banner">[ A4 TEST PRINT - CANON G3010 (TOP-LEFT) ]</div>' : ''}
        ${
          payload.isTest || (payload.orderNumber && payload.orderNumber.startsWith('TEST-')) || (payload.kotNumber && payload.kotNumber.includes('TEST'))
            ? '<div class="test-print-banner">*** TEST PRINT — NOT A CUSTOMER ORDER ***</div>'
            : ''
        }
        ${payload.isReprint ? '<div class="reprint-banner">*** DUPLICATE REPRINT ***</div>' : ''}
        
        <div class="center bold" style="font-size: ${headerFontSize}; letter-spacing: 0.5px; color: #000000 !important; font-weight: bold !important;">
          ${payload.restaurantName || 'STARTERS4U'}
        </div>
        ${payload.branchName ? `<div class="center bold" style="font-size: ${is58 ? '10px' : '12px'}; color: #000000 !important; font-weight: bold !important;">${payload.branchName}</div>` : ''}

        <div class="divider"></div>

        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #000000 !important;">
          <span style="font-weight: bold; color: #000000 !important;">KOT: ${payload.kotNumber}</span>
          <span style="font-weight: bold; color: #000000 !important;">${formatStationHeading(payload.station)}</span>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '10px' : '12px'}; font-weight: bold; color: #000000 !important;">
          <span style="font-weight: bold; color: #000000 !important;">Ord: ${formatDisplayOrderNumber(payload.orderNumber)}</span>
          <span style="font-weight: bold; color: #000000 !important;">${payload.orderType?.toUpperCase()}</span>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '10px' : '11px'}; font-weight: bold; color: #000000 !important;">
          <span style="font-weight: bold; color: #000000 !important;">${formattedDate}</span>
          <span style="font-weight: bold; color: #000000 !important;">${formattedTime}</span>
        </div>

        ${
          payload.tableNumber
            ? `
          <div class="double-divider"></div>
          <div class="center bold" style="font-size: ${tableFontSize}; padding: 2px 0; color: #000000 !important; font-weight: bold !important;">
            TABLE: ${payload.tableNumber}
          </div>
          <div class="double-divider"></div>
        `
            : '<div class="double-divider"></div>'
        }

        <div style="font-weight: bold; margin-bottom: 4px; font-size: ${is58 ? '11px' : '13px'}; color: #000000 !important;">ITEMS:</div>
        ${itemsHtml}

        ${
          payload.specialInstructions
            ? `
          <div style="margin-top: 6px; padding: 4px; border: 1.5px solid #000000; font-size: ${is58 ? '10px' : '12px'}; font-weight: bold; color: #000000 !important;">
            <strong style="color: #000000 !important;">ORDER NOTE:</strong> ${payload.specialInstructions}
          </div>
        `
            : ''
        }

        <div class="divider"></div>
        <div class="center bold" style="font-size: ${is58 ? '10px' : '11px'}; margin-top: 6px; padding-bottom: 24px; color: #000000 !important; font-weight: bold !important;">
          --- END OF TICKET ---
        </div>
        ${isA4Test ? '<div class="center bold" style="font-size: 10px; color: #000000 !important; font-weight: bold !important; margin-top: 6px;">✂ CUT ALONG DASHED LINE FOR RECEIPT ✂</div>' : ''}
      </body>
    </html>
  `;
}

/**
 * Generates an isolated HTML page for tax bills / customer receipts.
 */
export function generateBillHtml(payload: BillTicketPayload, paperWidthMm: PaperWidthMm = 80): string {
  const is58 = paperWidthMm === 58;
  const isA4Test = paperWidthMm === 'A4_TEST';
  const widthPx = is58 ? '190px' : isA4Test ? '280px' : '270px';
  const fontSize = is58 ? '11px' : '12px';
  const headerFontSize = is58 ? '15px' : '18px';
  const totalFontSize = is58 ? '15px' : '18px';

  const formattedTime = new Date(payload.orderTime).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const formattedDate = new Date(payload.orderTime).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const itemsHtml = payload.items
    .map((item) => {
      const addonsText = item.addons && item.addons.length > 0 ? `+ ${item.addons.join(', ')}` : '';
      return `
        <div style="margin-bottom: 4px; color: #000000 !important;">
          <div style="display: flex; justify-content: space-between; color: #000000 !important;">
            <span style="flex: 1; word-break: break-word; font-weight: bold; color: #000000 !important; font-size: ${is58 ? '12px' : '13px'};">${item.name}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '11px' : '12px'}; font-weight: bold; color: #000000 !important;">
            <span style="color: #000000 !important; font-weight: bold;">${item.quantity} x ₹${Number(item.unitPrice).toFixed(2)}</span>
            <span style="font-weight: bold; color: #000000 !important;">₹${Number(item.itemTotal).toFixed(2)}</span>
          </div>
          ${addonsText ? `<div style="font-size: ${is58 ? '10px' : '11px'}; font-weight: bold; color: #000000 !important;">${addonsText}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Bill - ${payload.billNumber}</title>
        <style>
          @page {
            margin: ${isA4Test ? '5mm' : '0'};
            size: ${isA4Test ? 'A4 portrait' : is58 ? '58mm auto' : '80mm auto'};
          }
          * {
            color: #000000 !important;
            opacity: 1 !important;
            font-weight: bold !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            margin: 0;
            padding: ${isA4Test ? '6px 10px' : '2px 4px'};
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${fontSize};
            font-weight: bold !important;
            line-height: 1.3;
            color: #000000 !important;
            background: #ffffff !important;
            width: ${widthPx};
            max-width: ${widthPx};
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            opacity: 1 !important;
            page-break-inside: avoid;
            text-rendering: geometricPrecision;
            ${isA4Test ? 'border-right: 1px dashed #777; border-bottom: 1px dashed #777; padding-bottom: 16px;' : ''}
          }
          .center { text-align: center; color: #000000 !important; font-weight: bold !important; }
          .bold { font-weight: bold !important; color: #000000 !important; }
          .row { display: flex; justify-content: space-between; color: #000000 !important; font-weight: bold !important; }
          .divider { border-bottom: 1.5px dashed #000000; margin: 4px 0; }
          .double-divider { border-bottom: 2px solid #000000; margin: 5px 0; }
          .reprint-banner {
            border: 2px solid #000000;
            padding: 3px;
            text-align: center;
            font-weight: bold !important;
            font-size: ${is58 ? '12px' : '14px'};
            margin-bottom: 4px;
            color: #000000 !important;
          }
          .a4-test-banner {
            border: 1.5px dashed #000000;
            background: #ffffff;
            padding: 4px;
            text-align: center;
            font-weight: bold !important;
            font-size: 10px;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
            color: #000000 !important;
          }
          .test-print-banner {
            border: 2px solid #000000;
            padding: 4px;
            text-align: center;
            font-weight: bold !important;
            font-size: ${is58 ? '10px' : '11px'};
            margin-bottom: 6px;
            letter-spacing: 0.5px;
            background: #ffffff;
            color: #000000 !important;
          }
        </style>
      </head>
      <body>
        ${isA4Test ? '<div class="a4-test-banner">[ A4 TEST PRINT - CANON G3010 (TOP-LEFT) ]</div>' : ''}
        ${
          payload.isTest || (payload.orderNumber && payload.orderNumber.startsWith('TEST-')) || (payload.billNumber && payload.billNumber.includes('TEST'))
            ? '<div class="test-print-banner">*** TEST PRINT — NOT A CUSTOMER ORDER ***</div>'
            : ''
        }
        ${payload.isReprint ? '<div class="reprint-banner">*** DUPLICATE BILL ***</div>' : ''}

        <div class="center bold" style="font-size: ${headerFontSize}; color: #000000 !important; font-weight: bold !important;">
          ${payload.restaurantName || 'STARTERS4U'}
        </div>
        <div class="center bold" style="font-size: ${is58 ? '10px' : '12px'}; color: #000000 !important; font-weight: bold !important;">
          ${payload.branchName || 'Main Branch'}
        </div>
        ${payload.branchAddress ? `<div class="center bold" style="font-size: ${is58 ? '10px' : '11px'}; color: #000000 !important; font-weight: bold !important;">${payload.branchAddress}</div>` : ''}
        ${payload.branchPhone ? `<div class="center bold" style="font-size: ${is58 ? '10px' : '11px'}; color: #000000 !important; font-weight: bold !important;">Phone: ${payload.branchPhone}</div>` : ''}
        ${payload.gstin ? `<div class="center bold" style="font-size: ${is58 ? '10px' : '11px'}; margin-top: 2px; color: #000000 !important; font-weight: bold !important;">GSTIN: ${payload.gstin}</div>` : ''}

        <div class="double-divider"></div>

        <div class="row bold" style="color: #000000 !important; font-weight: bold !important;">
          <span>${payload.billNumber}</span>
          <span>${formatDisplayOrderNumber(payload.orderNumber)}</span>
        </div>
        <div class="row bold" style="font-size: ${is58 ? '10px' : '11px'}; color: #000000 !important; font-weight: bold !important;">
          <span>${formattedDate}</span>
          <span>${formattedTime}</span>
        </div>
        <div class="row bold" style="font-size: ${is58 ? '11px' : '12px'}; color: #000000 !important; font-weight: bold !important;">
          <span>Type: ${payload.orderType?.toUpperCase()}</span>
          ${payload.tableNumber ? `<span class="bold" style="color: #000000 !important; font-weight: bold !important;">Table: ${payload.tableNumber}</span>` : ''}
        </div>

        ${
          payload.customerName
            ? `
          <div class="bold" style="font-size: ${is58 ? '10px' : '11px'}; margin-top: 2px; color: #000000 !important; font-weight: bold !important;">
            Cust: ${payload.customerName} ${payload.customerPhone ? `(${payload.customerPhone})` : ''}
          </div>
        `
            : ''
        }

        <div class="divider"></div>

        <div class="row bold" style="border-bottom: 1.5px solid #000000; padding-bottom: 2px; margin-bottom: 4px; color: #000000 !important; font-weight: bold !important;">
          <span style="color: #000000 !important; font-weight: bold !important;">Item</span>
          <span style="color: #000000 !important; font-weight: bold !important;">Amount</span>
        </div>

        ${itemsHtml}

        <div class="divider"></div>

        <div class="row bold" style="color: #000000 !important; font-weight: bold !important;">
          <span style="color: #000000 !important; font-weight: bold !important;">Subtotal:</span>
          <span style="color: #000000 !important; font-weight: bold !important;">₹${Number(payload.itemTotal).toFixed(2)}</span>
        </div>

        ${
          payload.discount > 0
            ? `
          <div class="row bold" style="color: #000000 !important; font-weight: bold !important;">
            <span style="color: #000000 !important; font-weight: bold !important;">Discount:</span>
            <span style="color: #000000 !important; font-weight: bold !important;">- ₹${Number(payload.discount).toFixed(2)}</span>
          </div>
        `
            : ''
        }

        ${
          payload.tax > 0
            ? `
          <div class="row bold" style="color: #000000 !important; font-weight: bold !important;">
            <span style="color: #000000 !important; font-weight: bold !important;">GST / Taxes${payload.taxRate ? ` (${payload.taxRate}%)` : ''}:</span>
            <span style="color: #000000 !important; font-weight: bold !important;">₹${Number(payload.tax).toFixed(2)}</span>
          </div>
        `
            : ''
        }

        ${
          payload.deliveryFee > 0
            ? `
          <div class="row bold" style="color: #000000 !important; font-weight: bold !important;">
            <span style="color: #000000 !important; font-weight: bold !important;">Delivery Fee:</span>
            <span style="color: #000000 !important; font-weight: bold !important;">₹${Number(payload.deliveryFee).toFixed(2)}</span>
          </div>
        `
            : ''
        }

        <div class="double-divider"></div>

        <div class="row bold" style="font-size: ${totalFontSize}; color: #000000 !important; font-weight: 900 !important;">
          <span style="color: #000000 !important; font-weight: 900 !important;">GRAND TOTAL:</span>
          <span style="color: #000000 !important; font-weight: 900 !important;">₹${Number(payload.grandTotal).toFixed(2)}</span>
        </div>

        <div class="double-divider"></div>

        <div class="row bold" style="font-size: ${is58 ? '10px' : '12px'}; color: #000000 !important; font-weight: bold !important;">
          <span style="color: #000000 !important; font-weight: bold !important;">Payment:</span>
          <span class="bold" style="color: #000000 !important; font-weight: bold !important;">${payload.paymentMethod?.toUpperCase()} (${payload.paymentStatus?.toUpperCase()})</span>
        </div>

        <div class="divider"></div>

        <div class="center bold" style="font-size: ${is58 ? '10px' : '11px'}; margin-top: 8px; color: #000000 !important; font-weight: bold !important;">
          Thank you for choosing Starters4U!<br>
          Please visit again!
        </div>

        ${isA4Test ? '<div class="center bold" style="font-size: 10px; color: #000000 !important; font-weight: bold !important; margin-top: 10px;">✂ CUT ALONG DASHED LINE FOR RECEIPT ✂</div>' : ''}

        <div style="height: 30px;"></div>
      </body>
    </html>
  `;
}
