/** Thrown by data functions that are planned but not switched on yet for the live database. */
export class NotAvailableYetError extends Error {
  constructor(feature: string) {
    super(`${feature} is not available yet`);
    this.name = "NotAvailableYetError";
  }
}

/**
 * A bill was refused for a reason the person can fix, e.g. "serial_sold".
 * The code matches a message in the translations: billErrors.<code>.
 */
export class BillError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, details: Record<string, unknown> = {}) {
    super(code);
    this.name = "BillError";
    this.code = code;
    this.details = details;
  }
}

/** Turn a database error raised by bill_error() into a BillError. Returns null for anything else. */
export function asBillError(err: unknown): BillError | null {
  if (err instanceof BillError) return err;
  if (err && typeof err === "object" && "hint" in err && (err as { hint?: unknown }).hint === "bill_error") {
    const { message, details } = err as unknown as { message: string; details?: string };
    let parsed: Record<string, unknown> = {};
    try {
      parsed = details ? (JSON.parse(details) as Record<string, unknown>) : {};
    } catch {
      parsed = {};
    }
    return new BillError(message, parsed);
  }
  return null;
}
