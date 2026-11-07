import type { ButtonHTMLAttributes, ComponentType } from "react";
import { Link, type LinkProps } from "react-router";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "xl";
type Icon = ComponentType<{ className?: string }>;

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap select-none " +
  "transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 " +
  "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-brand-800 text-white shadow-sm hover:bg-brand-900 active:bg-brand-950",
  secondary: "border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-slate-700 hover:bg-slate-100 active:bg-slate-200",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-200",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-200",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-13 px-6 text-base",
  xl: "h-16 px-7 text-lg",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: Icon;
  loading?: boolean;
}

export function Button({
  variant,
  size,
  icon: IconComponent,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {loading ? <Spinner /> : IconComponent ? <IconComponent className="size-5 shrink-0" /> : null}
      {children}
    </button>
  );
}

export interface LinkButtonProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: Icon;
}

export function LinkButton({ variant, size, icon: IconComponent, className, children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClasses(variant, size, className as string | undefined)} {...props}>
      {IconComponent ? <IconComponent className="size-5 shrink-0" /> : null}
      {children}
    </Link>
  );
}
