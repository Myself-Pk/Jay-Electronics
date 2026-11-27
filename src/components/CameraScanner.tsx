import { useEffect, useRef, useState } from "react";
import { CameraOff, CircleCheck, ImageUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { getCodeReader, makeRepeatGuard, readCodesFromPhoto, scanFeedback } from "@/lib/scanner";

/** What the screen using the scanner did with a code. */
export type ScanOutcome = { kind: "added"; label: string } | { kind: "refused"; message: string } | { kind: "stop" };

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called for each new code. "stop" closes the camera (e.g. to ask which product it is). */
  onCode: (code: string) => Promise<ScanOutcome>;
}

type CameraState = "starting" | "on" | "denied" | "missing" | "failed";

/**
 * Full-screen phone camera that reads barcodes and QR codes, one after another, until "Done".
 * Uses the back camera; needs the site to be allowed to use the camera (asked once by the browser).
 */
export function CameraScanner({ open, onClose, onCode }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [state, setState] = useState<CameraState>("starting");
  const [last, setLast] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const photoRef = useRef<HTMLInputElement>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
  /** Amber note: a photo without a code, or an item that couldn't be added (e.g. out of stock). */
  const [notice, setNotice] = useState<string | null>(null);

  const showOutcome = (outcome: Exclude<ScanOutcome, { kind: "stop" }>) => {
    if (outcome.kind === "refused") {
      setNotice(outcome.message);
      return;
    }
    setNotice(null);
    setLast(outcome.label);
    setCount((n) => n + 1);
  };

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const fresh = makeRepeatGuard();
    setState("starting");
    setLast(null);
    setCount(0);
    setReadingPhoto(false);
    setNotice(null);

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("no camera api"), { name: "NotFoundError" });
        const [reader, media] = await Promise.all([
          getCodeReader(),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          }),
        ]);
        stream = media;
        if (stopped) return;
        const video = videoRef.current!;
        video.srcObject = media;
        await video.play();
        setState("on");

        const tick = async () => {
          if (stopped) return;
          let wait = 180;
          try {
            if (video.readyState >= 2) {
              const code = (await reader.read(video)).map((c) => c.trim()).find((c) => c && fresh(c));
              if (code && !stopped) {
                scanFeedback();
                const outcome = await onCodeRef.current(code);
                if (outcome.kind === "stop") return; // the screen closes the camera
                showOutcome(outcome);
                wait = 900; // a moment before the next code, so one box isn't counted twice
              }
            }
          } catch (err) {
            console.warn("scan failed", err);
          }
          timer = window.setTimeout(() => void tick(), wait);
        };
        void tick();
      } catch (err) {
        if (stopped) return;
        const name = err instanceof Error ? err.name : "";
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "missing" : "failed");
        console.warn("camera failed", err);
      }
    };
    void start();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  if (!open) return null;

  /** A photo from the gallery: read its code and handle it like a camera scan. */
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setReadingPhoto(true);
    setNotice(null);
    try {
      const code = (await readCodesFromPhoto(file)).map((c) => c.trim()).find(Boolean);
      if (!code) {
        setNotice(t("scan.photoNone"));
        return;
      }
      scanFeedback();
      const outcome = await onCodeRef.current(code);
      if (outcome.kind !== "stop") showOutcome(outcome);
    } catch (err) {
      console.warn("photo scan failed", err);
      setNotice(t("scan.photoNone"));
    } finally {
      setReadingPhoto(false);
      if (photoRef.current) photoRef.current.value = ""; // the same photo can be picked again
    }
  };

  const problem =
    state === "denied" ? t("scan.noPermission") : state === "missing" ? t("scan.noCamera") : state === "failed" ? t("scan.failed") : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={t("scan.title")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="flex-1 text-[17px] font-semibold">{t("scan.title")}</p>
        <button type="button" onClick={onClose} aria-label={t("scan.close")} className="flex size-11 items-center justify-center rounded-xl hover:bg-white/10">
          <X className="size-6" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
        {state === "on" ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-44 w-[78%] max-w-md rounded-2xl border-4 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
          </div>
        ) : null}
        {state === "starting" ? <p className="absolute inset-0 flex items-center justify-center text-[15px] text-white/80">{t("scan.starting")}</p> : null}
        {problem ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <CameraOff className="size-10 text-white/70" />
            <p className="max-w-sm text-[16px]">{problem}</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 bg-black px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {last ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-600/90 px-4 py-2.5 text-[15px] font-semibold" role="status">
            <CircleCheck className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t("scan.added", { product: last })}</span>
            <span className="text-sm font-normal text-white/90">{t("scan.count", { count })}</span>
          </p>
        ) : (
          <p className="text-center text-[15px] text-white/80">{t("scan.hint")}</p>
        )}
        {notice ? (
          <p className="rounded-xl bg-amber-500/90 px-4 py-2.5 text-center text-[15px] font-semibold text-slate-950" role="alert">
            {notice}
          </p>
        ) : null}
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onPhoto(e.target.files?.[0])}
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={readingPhoto}
            className="flex h-16 flex-1 items-center justify-center gap-2 rounded-xl border border-white/40 text-[16px] font-semibold hover:bg-white/10 disabled:opacity-60"
          >
            <ImageUp className="size-5" />
            {readingPhoto ? t("scan.photoReading") : t("scan.photo")}
          </button>
          <Button size="xl" onClick={onClose} className="flex-1">
            {t("scan.done")}
          </Button>
        </div>
      </div>
    </div>
  );
}
