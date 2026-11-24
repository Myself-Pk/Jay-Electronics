/**
 * Reading barcodes and QR codes from the phone camera.
 *
 * Chrome on Android (the owner's phone and the APK) has a built-in, fast barcode reader
 * (BarcodeDetector). Elsewhere (iPhone, Windows) the same reader is provided by the
 * `barcode-detector` library — loaded only when needed, with its WebAssembly file served by
 * this app (not an outside website).
 */

/** Codes found on battery / inverter boxes, price labels and QR stickers. */
export const SCAN_FORMATS = [
  "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "codabar", "itf", "qr_code", "data_matrix",
] as const;

export interface CodeReader {
  /** Codes visible in the current video frame (usually 0 or 1). */
  read: (source: HTMLVideoElement) => Promise<string[]>;
}

interface NativeDetector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

let reader: Promise<CodeReader> | null = null;

async function nativeReader(): Promise<CodeReader | null> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Native?.getSupportedFormats) return null;
  try {
    const supported = await Native.getSupportedFormats();
    const formats = SCAN_FORMATS.filter((f) => supported.includes(f));
    if (!formats.includes("ean_13") || !formats.includes("qr_code")) return null;
    const detector = new Native({ formats });
    return { read: async (video) => (await detector.detect(video)).map((c) => c.rawValue) };
  } catch {
    return null;
  }
}

async function libraryReader(): Promise<CodeReader> {
  const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  });
  const detector = new BarcodeDetector({ formats: [...SCAN_FORMATS] });
  return { read: async (video) => (await detector.detect(video)).map((c) => c.rawValue) };
}

/** The best reader this device has (made once, then reused). */
export function getCodeReader(): Promise<CodeReader> {
  reader ??= nativeReader().then((native) => native ?? libraryReader());
  return reader;
}

/** A short beep and buzz so the person knows a code was read. */
export function scanFeedback(): void {
  try {
    navigator.vibrate?.(60);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1500;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => void ctx.close();
  } catch {
    // No sound is fine.
  }
}

/** Skip the same code seen again within a moment (the camera sees it in every frame). */
export function makeRepeatGuard(ms = 1500) {
  let last = "";
  let at = 0;
  return (code: string, now = Date.now()): boolean => {
    if (code === last && now - at < ms) return false;
    last = code;
    at = now;
    return true;
  };
}
