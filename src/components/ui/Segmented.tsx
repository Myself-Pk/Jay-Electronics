import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/** A small "pick one" switch, e.g. EN | हिं */
export function Segmented<T extends string>({ value, options, onChange, label, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-xl bg-slate-100 p-1", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-w-11 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              selected ? "bg-white text-brand-800 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
