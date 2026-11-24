/**
 * Bill → PDF file, made in the browser from the on-screen A4 bill (so it looks exactly like the
 * printed one), then handed to WhatsApp through the phone's / computer's share menu.
 *
 * Free WhatsApp links ("wa.me") can only carry text, so a file can't be pushed straight into a
 * customer's chat without the paid WhatsApp Business API. The share menu is the free way: it opens
 * WhatsApp with the PDF attached and the shop picks the customer's chat.
 */

/** "JE/26-27/0001" → "Bill-JE-26-27-0001.pdf" */
export function billPdfName(billNumber: string): string {
  return `Bill-${billNumber.replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}

/** A4 portrait in mm. */
const PAGE_W = 210;
const PAGE_H = 297;

/**
 * Turn the rendered bill sheet into an A4 PDF. The two libraries are loaded only when a PDF is
 * actually needed, so they don't slow down the rest of the app.
 */
export async function billSheetToPdf(sheet: HTMLElement, fileName: string): Promise<File> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const canvas = await toCanvas(sheet, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    preferredFontFormat: "woff2",
    cacheBust: false,
  });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const image = canvas.toDataURL("image/jpeg", 0.9);
  const imageH = (canvas.height * PAGE_W) / canvas.width;
  // Long bills continue on the next page (same picture, moved up one page at a time).
  for (let top = 0, page = 0; top < imageH - 0.5; top += PAGE_H, page++) {
    if (page > 0) pdf.addPage();
    pdf.addImage(image, "JPEG", 0, -top, PAGE_W, imageH);
  }
  pdf.setProperties({ title: fileName.replace(/\.pdf$/, "") });
  return new File([pdf.output("blob")], fileName, { type: "application/pdf" });
}

export type ShareResult = "shared" | "cancelled" | "downloaded";

/**
 * Send the PDF: the share menu where the device supports sharing files (Android, Windows, iPhone),
 * otherwise download it and open the customer's WhatsApp chat so it can be attached by hand.
 * Must be called straight from a tap (browsers only allow sharing right after one).
 */
export async function shareBillPdf(file: File, text: string, fallbackChatUrl: string): Promise<ShareResult> {
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Not allowed (e.g. the tap was too long ago): fall through to downloading it.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  const win = window.open(fallbackChatUrl, "_blank");
  if (win) win.opener = null;
  return "downloaded";
}
