import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}

/** An on/off switch with a label. */
export function Switch({ checked, onChange, label, description }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl py-1 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
    >
      <span>
        <span className="block text-[15px] font-semibold text-slate-900">{label}</span>
        {description ? <span className="block text-sm text-slate-500">{description}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-emerald-600" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}
