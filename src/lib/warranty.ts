/** Warranty state of a battery or inverter on a given day. Dates are yyyy-mm-dd. */

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  // Clamp to the last day of the month (31 Jan + 1 month = 28/29 Feb).
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())}`;
}

export type WarrantyState =
  | { state: "free"; until: string; prorataUntil: string | null }
  | { state: "prorata"; until: string }
  | { state: "expired"; endedOn: string }
  | { state: "none" };

export function warrantyStatus(start: string | null, freeMonths: number, prorataMonths: number, today: string): WarrantyState {
  if (!start || freeMonths + prorataMonths <= 0) return { state: "none" };
  const freeUntil = addMonths(start, freeMonths);
  const prorataUntil = prorataMonths > 0 ? addMonths(start, freeMonths + prorataMonths) : null;
  if (freeMonths > 0 && today <= freeUntil) return { state: "free", until: freeUntil, prorataUntil };
  if (prorataUntil && today <= prorataUntil) return { state: "prorata", until: prorataUntil };
  return { state: "expired", endedOn: prorataUntil ?? freeUntil };
}
