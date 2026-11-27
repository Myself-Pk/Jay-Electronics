/**
 * Parts of the app switched off at the owner's request (Nov 2026) to keep it simple.
 * The database keeps supporting them; set a switch back to true to show that part again.
 *
 * - purchasePrices: purchase price on products, rates on "New stock arrived", purchase totals,
 *   and every profit figure (Home, Reports).
 * - serialNumbers: batteries, inverters etc. are counted by serial number — each piece's
 *   barcode / QR code is scanned when stock arrives and when it is sold. Switched back on
 *   27 Nov 2026 (it was off 24–27 Nov); accessories stay counted by quantity.
 */
export const FEATURES = {
  purchasePrices: false,
  serialNumbers: true,
} as const;
