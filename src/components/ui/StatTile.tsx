import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";

interface StatTileProps {
  label: ReactNode;
  /** null while loading */
  value: string | null;
  sub?: ReactNode;
  tone?: "red" | "green";
  to?: string;
}

/** One headline number with a small line of context underneath (Home, Close Day, Reports). */
export function StatTile({ label, value, sub, tone, to }: StatTileProps) {
  const body = (
    <>
      <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      {value === null ? (
        <div className="mt-2 h-9 w-32 max-w-full animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <p
          className={cn(
            "mt-1 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl",
            tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-700" : "text-slate-900",
          )}
        >
          {value}
        </p>
      )}
      {sub ? <div className="mt-1 text-sm text-slate-500">{sub}</div> : null}
    </>
  );
  const cls = "block rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-5";
  return to ? (
    <Link to={to} className={cn(cls, "transition-colors hover:border-brand-300")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
