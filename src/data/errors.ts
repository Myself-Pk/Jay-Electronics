/** Thrown by data functions that are planned but not switched on yet for the live database. */
export class NotAvailableYetError extends Error {
  constructor(feature: string) {
    super(`${feature} is not available yet`);
    this.name = "NotAvailableYetError";
  }
}
