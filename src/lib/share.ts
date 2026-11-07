import { fromPaise, type Paise } from "./money";

/** Opens a WhatsApp chat with an Indian mobile number and a ready-typed message (free "click to chat"). */
export function whatsAppUrl(mobile10: string, text: string): string {
  return `https://wa.me/91${mobile10}?text=${encodeURIComponent(text)}`;
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

/** The public link the customer gets on WhatsApp to view or download their bill. */
export function billShareUrl(token: string): string {
  return `${window.location.origin}/b/${token}`;
}
