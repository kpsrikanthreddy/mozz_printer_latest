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
  const fontSize = is58 ? '11px' : '13px';
  const headerFontSize = is58 ? '15px' : '18px';
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
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; margin-bottom: 4px;">
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: ${is58 ? '12px' : '14px'};">
            <span style="flex: 1; word-break: break-word;">${item.name}</span>
            <span style="font-size: ${is58 ? '14px' : '16px'}; min-width: 28px; text-align: right;">[ x${item.quantity} ]</span>
          </div>
          ${shapeCrust ? `<div style="font-size: ${is58 ? '9px' : '11px'}; color: #222; margin-top: 2px;">${shapeCrust}</div>` : ''}
          ${addonsText ? `<div style="font-size: ${is58 ? '9px' : '11px'}; color: #222;">${addonsText}</div>` : ''}
          ${notesText ? `<div style="font-size: ${is58 ? '9px' : '11px'}; font-style: italic; font-weight: bold; margin-top: 1px;">* ${notesText}</div>` : ''}
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
            size: ${isA4Test ? 'A4 portrait' : 'auto'};
          }
          body {
            margin: 0;
            padding: ${isA4Test ? '6px 10px' : '4px 6px'};
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${fontSize};
            line-height: 1.25;
            color: #000;
            background: #fff;
            width: ${widthPx};
            max-width: ${widthPx};
            box-sizing: border-box;
            ${isA4Test ? 'border-right: 1px dashed #777; border-bottom: 1px dashed #777; padding-bottom: 16px;' : ''}
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-bottom: 1px dashed #000; margin: 4px 0; }
          .double-divider { border-bottom: 2px solid #000; margin: 6px 0; }
          .reprint-banner {
            border: 2px solid #000;
            padding: 3px;
            text-align: center;
            font-weight: bold;
            font-size: ${headerFontSize};
            margin-bottom: 4px;
            letter-spacing: 1px;
          }
          .a4-test-banner {
            border: 1px dashed #555;
            background: #f3f4f6;
            padding: 4px;
            text-align: center;
            font-weight: bold;
            font-size: 10px;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
          }
          .test-print-banner {
            border: 2px solid #000;
            padding: 4px;
            text-align: center;
            font-weight: bold;
            font-size: ${is58 ? '10px' : '11px'};
            margin-bottom: 6px;
            letter-spacing: 0.5px;
            background: #fff;
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
        
        <div class="center bold" style="font-size: ${headerFontSize}; letter-spacing: 0.5px;">
          ${payload.restaurantName || 'STARTERS4U'}
        </div>
        ${payload.branchName ? `<div class="center" style="font-size: ${is58 ? '10px' : '11px'};">${payload.branchName}</div>` : ''}

        <div class="divider"></div>

        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>KOT: ${payload.kotNumber}</span>
          <span>${formatStationHeading(payload.station)}</span>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '10px' : '11px'};">
          <span>Ord: ${formatDisplayOrderNumber(payload.orderNumber)}</span>
          <span>${payload.orderType?.toUpperCase()}</span>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '9px' : '10px'}; color: #333;">
          <span>${formattedDate}</span>
          <span>${formattedTime}</span>
        </div>

        ${
          payload.tableNumber
            ? `
          <div class="double-divider"></div>
          <div class="center bold" style="font-size: ${tableFontSize}; padding: 2px 0;">
            TABLE: ${payload.tableNumber}
          </div>
          <div class="double-divider"></div>
        `
            : '<div class="double-divider"></div>'
        }

        <div style="font-weight: bold; margin-bottom: 4px; font-size: ${is58 ? '10px' : '12px'};">ITEMS:</div>
        ${itemsHtml}

        ${
          payload.specialInstructions
            ? `
          <div style="margin-top: 6px; padding: 4px; border: 1px solid #000; font-size: ${is58 ? '10px' : '11px'};">
            <strong>ORDER NOTE:</strong> ${payload.specialInstructions}
          </div>
        `
            : ''
        }

        <div class="divider"></div>
        <div class="center" style="font-size: ${is58 ? '9px' : '10px'}; margin-top: 6px; padding-bottom: 24px;">
          --- END OF TICKET ---
        </div>
        ${isA4Test ? '<div class="center" style="font-size: 9px; color: #555; margin-top: 6px;">✂ CUT ALONG DASHED LINE FOR RECEIPT ✂</div>' : ''}
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
  const headerFontSize = is58 ? '14px' : '17px';
  const totalFontSize = is58 ? '14px' : '17px';

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
        <div style="margin-bottom: 3px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="flex: 1; word-break: break-word; font-weight: 500;">${item.name}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '10px' : '11px'}; color: #222;">
            <span>${item.quantity} x ₹${Number(item.unitPrice).toFixed(2)}</span>
            <span style="font-weight: bold;">₹${Number(item.itemTotal).toFixed(2)}</span>
          </div>
          ${addonsText ? `<div style="font-size: ${is58 ? '9px' : '10px'}; color: #444;">${addonsText}</div>` : ''}
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
            size: ${isA4Test ? 'A4 portrait' : 'auto'};
          }
          body {
            margin: 0;
            padding: ${isA4Test ? '6px 10px' : '4px 6px'};
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${fontSize};
            line-height: 1.25;
            color: #000;
            background: #fff;
            width: ${widthPx};
            max-width: ${widthPx};
            box-sizing: border-box;
            ${isA4Test ? 'border-right: 1px dashed #777; border-bottom: 1px dashed #777; padding-bottom: 16px;' : ''}
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .row { display: flex; justify-content: space-between; }
          .divider { border-bottom: 1px dashed #000; margin: 4px 0; }
          .double-divider { border-bottom: 2px solid #000; margin: 6px 0; }
          .reprint-banner {
            border: 2px solid #000;
            padding: 3px;
            text-align: center;
            font-weight: bold;
            font-size: ${is58 ? '12px' : '14px'};
            margin-bottom: 4px;
          }
          .a4-test-banner {
            border: 1px dashed #555;
            background: #f3f4f6;
            padding: 4px;
            text-align: center;
            font-weight: bold;
            font-size: 10px;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
          }
          .test-print-banner {
            border: 2px solid #000;
            padding: 4px;
            text-align: center;
            font-weight: bold;
            font-size: ${is58 ? '10px' : '11px'};
            margin-bottom: 6px;
            letter-spacing: 0.5px;
            background: #fff;
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

        <div class="center bold" style="font-size: ${headerFontSize};">
          ${payload.restaurantName || 'STARTERS4U'}
        </div>
        <div class="center" style="font-size: ${is58 ? '10px' : '11px'};">
          ${payload.branchName || 'Main Branch'}
        </div>
        ${payload.branchAddress ? `<div class="center" style="font-size: ${is58 ? '9px' : '10px'}; color: #333;">${payload.branchAddress}</div>` : ''}
        ${payload.branchPhone ? `<div class="center" style="font-size: ${is58 ? '9px' : '10px'};">Phone: ${payload.branchPhone}</div>` : ''}
        ${payload.gstin ? `<div class="center bold" style="font-size: ${is58 ? '9px' : '10px'}; margin-top: 2px;">GSTIN: ${payload.gstin}</div>` : ''}

        <div class="double-divider"></div>

        <div class="row bold">
          <span>${payload.billNumber}</span>
          <span>${formatDisplayOrderNumber(payload.orderNumber)}</span>
        </div>
        <div class="row" style="font-size: ${is58 ? '9px' : '10px'}; color: #333;">
          <span>${formattedDate}</span>
          <span>${formattedTime}</span>
        </div>
        <div class="row" style="font-size: ${is58 ? '10px' : '11px'};">
          <span>Type: ${payload.orderType?.toUpperCase()}</span>
          ${payload.tableNumber ? `<span class="bold">Table: ${payload.tableNumber}</span>` : ''}
        </div>

        ${
          payload.customerName
            ? `
          <div style="font-size: ${is58 ? '9px' : '10px'}; margin-top: 2px;">
            Cust: ${payload.customerName} ${payload.customerPhone ? `(${payload.customerPhone})` : ''}
          </div>
        `
            : ''
        }

        <div class="divider"></div>

        <div class="row bold" style="border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px;">
          <span>Item</span>
          <span>Amount</span>
        </div>

        ${itemsHtml}

        <div class="divider"></div>

        <div class="row">
          <span>Subtotal:</span>
          <span>₹${Number(payload.itemTotal).toFixed(2)}</span>
        </div>

        ${
          payload.discount > 0
            ? `
          <div class="row" style="color: #222;">
            <span>Discount:</span>
            <span>- ₹${Number(payload.discount).toFixed(2)}</span>
          </div>
        `
            : ''
        }

        ${
          payload.tax > 0
            ? `
          <div class="row">
            <span>GST / Taxes${payload.taxRate ? ` (${payload.taxRate}%)` : ''}:</span>
            <span>₹${Number(payload.tax).toFixed(2)}</span>
          </div>
        `
            : ''
        }

        ${
          payload.deliveryFee > 0
            ? `
          <div class="row">
            <span>Delivery Fee:</span>
            <span>₹${Number(payload.deliveryFee).toFixed(2)}</span>
          </div>
        `
            : ''
        }

        <div class="double-divider"></div>

        <div class="row bold" style="font-size: ${totalFontSize};">
          <span>GRAND TOTAL:</span>
          <span>₹${Number(payload.grandTotal).toFixed(2)}</span>
        </div>

        <div class="double-divider"></div>

        <div class="row" style="font-size: ${is58 ? '10px' : '11px'};">
          <span>Payment:</span>
          <span class="bold">${payload.paymentMethod?.toUpperCase()} (${payload.paymentStatus?.toUpperCase()})</span>
        </div>

        <div class="divider"></div>

        <div class="center" style="font-size: ${is58 ? '9px' : '10px'}; margin-top: 8px;">
          Thank you for choosing Starters4U!<br>
          Please visit again!
        </div>

        ${isA4Test ? '<div class="center" style="font-size: 9px; color: #555; margin-top: 10px;">✂ CUT ALONG DASHED LINE FOR RECEIPT ✂</div>' : ''}

        <div style="height: 30px;"></div>
      </body>
    </html>
  `;
}
