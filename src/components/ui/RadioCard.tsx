import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface RadioCardProps {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  text?: ReactNode;
  className?: string;
}

/** A big, easy-to-tap "choose one" option with a title and an explanation. */
export function RadioCard({ selected, onSelect, title, text, className }: RadioCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
        selected ? "border-brand-700 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-brand-700" : "border-slate-300",
        )}
      >
        {selected ? <span className="size-2.5 rounded-full bg-brand-700" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
        {text ? <span className="mt-0.5 block text-sm text-slate-600">{text}</span> : null}
      </span>
    </button>
  );
}
