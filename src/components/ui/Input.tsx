import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-xl border bg-white text-[15px] text-slate-900 shadow-sm placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500";

function stateClasses(invalid?: boolean) {
  return invalid
    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
    : "border-slate-300 focus:border-brand-600 focus:ring-brand-100";
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  invalid?: boolean;
  /** Shown inside the box on the left, e.g. "₹" */
  prefix?: ReactNode;
  /** Shown inside the box on the right, e.g. "%" or "per kg" */
  suffix?: ReactNode;
}

export function Input({ invalid, prefix, suffix, className, ...props }: InputProps) {
  const input = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        control,
        stateClasses(invalid),
        "h-11 px-3.5",
        prefix ? "pl-9" : undefined,
        suffix ? "pr-16" : undefined,
        className,
      )}
      {...props}
    />
  );
  if (!prefix && !suffix) return input;
  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[15px] text-slate-500">
          {prefix}
        </span>
      ) : null}
      {input}
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-slate-500">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, rows = 3, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(control, stateClasses(invalid), "px-3.5 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ invalid, className, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(control, stateClasses(invalid), "h-11 px-3", className)}
      {...props}
    >
      {children}
    </select>
  );
}
