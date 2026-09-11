/**
 * Order and Station Utility Helpers for Mozz Print Agent
 * Handles normalization, formatting, and backward-compatible station labelling.
 */

/**
 * Normalizes and extracts the human-readable order number from a raw job, order payload, or SQLite record.
 * Priority:
 * 1. orderNumber / order_number
 * 2. displayOrderId / display_order_id
 * 3. order?.orderNumber / order?.order_number / order?.displayOrderId / order?.display_order_id
 * 4. payload?.orderNumber / payload?.order_number / payload?.displayOrderId / payload?.display_order_id
 * 5. order?.id / payload?.orderId / payload?.order_id
 * 6. orderId / order_id
 *
 * If the value is a UUID or long hex string, formats it into a stable short form: `ORD-AB12CD34`.
 * If missing, empty, or placeholder '#', returns 'Unknown Order'.
 * Never returns bare '#' or an empty string.
 */
export function resolveOrderNumber(rawJob: any): string {
  if (!rawJob) return 'Unknown Order';

  const candidates: any[] = [
    rawJob.orderNumber,
    rawJob.order_number,
    rawJob.displayOrderId,
    rawJob.display_order_id,
    rawJob.order?.orderNumber,
    rawJob.order?.order_number,
    rawJob.order?.displayOrderId,
    rawJob.order?.display_order_id,
    rawJob.payload?.orderNumber,
    rawJob.payload?.order_number,
    rawJob.payload?.displayOrderId,
    rawJob.payload?.display_order_id,
    rawJob.order?.id,
    rawJob.payload?.orderId,
    rawJob.payload?.order_id,
    rawJob.orderId,
    rawJob.order_id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const clean = candidate.trim().replace(/^#+/, '').trim();
      if (
        clean &&
        clean !== '#' &&
        clean.toLowerCase() !== 'unknown' &&
        clean.toLowerCase() !== 'unknown order' &&
        clean.toLowerCase() !== 'null' &&
        clean.toLowerCase() !== 'undefined'
      ) {
        // Full UUID (8-4-4-4-12 hex format)
        const uuidMatch = clean.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        if (uuidMatch) {
          const shortHex = clean.replace(/-/g, '').substring(0, 8).toUpperCase();
          return `ORD-${shortHex}`;
        }
        // Long continuous hex string (24+ chars, e.g. Mongo ObjectId or SHA hash)
        if (/^[0-9a-f]{24,}$/i.test(clean)) {
          const shortHex = clean.substring(0, 8).toUpperCase();
          return `ORD-${shortHex}`;
        }
        return clean;
      }
    } else if (typeof candidate === 'number') {
      return String(candidate);
    }
  }

  return 'Unknown Order';
}

/**
 * Formats an order number for UI display and tickets.
 * Guarantees:
 * - Always starts with '#'
 * - Never renders a bare '#'
 * - Blank, missing, or '#' values become '#Unknown Order'
 * - Preserves existing formatted values like '#TEST-101' or '#ORD-AB12CD34'
 */
export function formatDisplayOrderNumber(orderNumber?: string | null): string {
  if (!orderNumber || !orderNumber.trim()) {
    return '#Unknown Order';
  }
  const clean = orderNumber.trim().replace(/^#+/, '').trim();
  if (
    !clean ||
    clean === '#' ||
    clean.toLowerCase() === 'unknown' ||
    clean.toLowerCase() === 'unknown order' ||
    clean.toLowerCase() === 'null' ||
    clean.toLowerCase() === 'undefined'
  ) {
    return '#Unknown Order';
  }

  // If a raw UUID was passed (e.g. from legacy records)
  const uuidMatch = clean.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (uuidMatch) {
    const shortHex = clean.replace(/-/g, '').substring(0, 8).toUpperCase();
    return `#ORD-${shortHex}`;
  }
  if (/^[0-9a-f]{24,}$/i.test(clean)) {
    const shortHex = clean.substring(0, 8).toUpperCase();
    return `#ORD-${shortHex}`;
  }

  return `#${clean}`;
}

/**
 * Returns customer-facing station label for dashboard and configuration UI.
 * Keeps internal station key `bar_beverage` intact while displaying 'Chinese Special'.
 */
export function getStationDisplayLabel(station?: string | null, includeWidth = true): string {
  if (!station) return includeWidth ? 'Kitchen Master (80mm)' : 'Kitchen Master';
  const s = station.toLowerCase().trim();
  if (s === 'bar_beverage' || s.includes('beverage') || s.includes('shakes') || s.includes('chinese')) {
    return includeWidth ? 'Chinese Special (58mm)' : 'Chinese Special';
  }
  if (s === 'billing') {
    return includeWidth ? 'Billing Counter (80mm)' : 'Billing Counter';
  }
  if (s === 'kitchen_master') {
    return includeWidth ? 'Kitchen Master (80mm)' : 'Kitchen Master';
  }
  if (s === 'kitchen_pizza') {
    return includeWidth ? 'Pizza Section (58mm)' : 'Pizza Section';
  }
  return station;
}

/**
 * Formats station name for thermal ticket headings (all caps).
 */
export function formatStationHeading(station?: string | null): string {
  if (!station) return 'KITCHEN';
  const s = station.toLowerCase().trim();
  if (s === 'bar_beverage' || s.includes('beverage') || s.includes('shakes') || s.includes('chinese')) {
    return 'CHINESE SPECIAL';
  }
  if (s === 'kitchen_master') {
    return 'KITCHEN MASTER';
  }
  if (s === 'kitchen_pizza') {
    return 'PIZZA SECTION';
  }
  if (s === 'billing') {
    return 'BILLING COUNTER';
  }
  return station.toUpperCase();
}
