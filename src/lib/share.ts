import { fromPaise, type Paise } from "./money";

/** Opens a WhatsApp chat with an Indian mobile number and a ready-typed message (free "click to chat"). */
export function whatsAppUrl(mobile10: string, text: string): string {
  return `https://wa.me/91${mobile10}?text=${encodeURIComponent(text)}`;
}

/** Opens WhatsApp with a ready-typed message; the person picks who to send it to. */
export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** A UPI payment link; any UPI app opens it with the amount filled in. Used for the QR code on bills. */
export function upiPayLink(opts: { upiId: string; payeeName: string; amount: Paise; note: string }): string {
  const params = [
    `pa=${opts.upiId.trim()}`,
    `pn=${encodeURIComponent(opts.payeeName)}`,
    `am=${fromPaise(opts.amount)}`,
    "cu=INR",
    `tn=${encodeURIComponent(opts.note)}`,
  ];
  return `upi://pay?${params.join("&")}`;
}

/**
 * The app's public address (set VITE_PUBLIC_URL, e.g. https://jay-electronics.pages.dev), so a
 * bill shared from the shop computer (running on localhost) still opens on the customer's phone.
 */
export function publicAppUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim().replace(/\/+$/, "");
  return configured || window.location.origin;
}

/** The public link the customer gets on WhatsApp to view or download their bill. */
export function billShareUrl(token: string): string {
  return `${publicAppUrl()}/b/${token}`;
}
