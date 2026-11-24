/**
 * Parts of the app switched off at the owner's request (Nov 2026) to keep it simple.
 * The database keeps supporting them; set a switch back to true to show that part again.
 *
 * - purchasePrices: purchase price on products, rates on "New stock arrived", purchase totals,
 *   and every profit figure (Home, Reports).
 * - serialNumbers: products are counted by quantity; no serial scanning when stock arrives or
 *   when billing. (Old sales from the paper register can still record a serial for warranty.)
 */
export const FEATURES = {
  purchasePrices: false,
  serialNumbers: false,
} as const;
