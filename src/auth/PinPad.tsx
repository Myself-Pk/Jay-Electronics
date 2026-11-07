import { useEffect } from "react";
import { Delete } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when all 6 digits are entered. */
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: boolean;
  length?: number;
}

/** Big number buttons for entering a PIN. Also works with the keyboard. */
export function PinPad({ value, onChange, onComplete, disabled, error, length = 6 }: PinPadProps) {
  const { t } = useTranslation();

  const press = (digit: string) => {
    if (disabled || value.length >= length) return;
    const next = value + digit;
    onChange(next);
    if (next.length === length) onComplete(next);
  };
  const backspace = () => {
    if (!disabled) onChange(value.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        press(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        backspace();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keyClass =
    "flex h-16 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-semibold text-slate-900 " +
    "transition-colors hover:bg-slate-200 active:bg-slate-300 disabled:opacity-50 " +
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className={cn("flex gap-3", error && "animate-shake")}
        aria-label={t("login.pinLabel")}
        role="status"
        aria-live="polite"
      >
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-4 rounded-full border-2 transition-colors",
              i < value.length
                ? error
                  ? "border-red-500 bg-red-500"
                  : "border-brand-800 bg-brand-800"
                : "border-slate-300 bg-white",
            )}
          />
        ))}
      </div>
      <div className="grid w-full max-w-72 grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" className={keyClass} disabled={disabled} onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <span />
        <button type="button" className={keyClass} disabled={disabled} onClick={() => press("0")}>
          0
        </button>
        <button
          type="button"
          className={cn(keyClass, "bg-transparent hover:bg-slate-100")}
          disabled={disabled}
          onClick={backspace}
          aria-label={t("login.deleteDigit")}
        >
          <Delete className="size-7 text-slate-600" />
        </button>
      </div>
    </div>
  );
}
