import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A label, the input, and a hint or error underneath. */
export function Field({ label, htmlFor, hint, error, optional, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-semibold text-slate-700">
        {label}
        {optional ? <span className="text-xs font-normal text-slate-400">{optional}</span> : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-sm text-red-600" role="alert">
          <CircleAlert className="size-4 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
