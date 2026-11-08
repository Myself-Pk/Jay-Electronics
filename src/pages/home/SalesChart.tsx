import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DashboardSummary } from "@/data/types";
import { cn } from "@/lib/cn";
import { parseISODate } from "@/lib/dates";
import { compactRupees, formatRupees } from "@/lib/money";
import { byMonth } from "@/lib/report";

interface SalesChartProps {
  days: DashboardSummary["days"];
  /**
   * "week": the Home screen's last 7 days (last bar is "Today").
   * "range": any dates on the Reports screen; more than 31 days are shown as months.
   */
  variant?: "week" | "range";
  caption?: string;
}

/**
 * Sales over time: one series, so one colour (brand blue, validated against the surface).
 * Thin bars with rounded tops on a baseline, faint guide lines, a hover/focus tooltip per bar,
 * a value label only on the best bar (and today on Home), and a hidden table for screen readers.
 */
export function SalesChart({ days, variant = "week", caption }: SalesChartProps) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState<number | null>(null);
  const locale = i18n.language === "hi" ? "hi-IN" : "en-IN";
  const monthly = variant === "range" && days.length > 31;
  const bars = monthly ? byMonth(days) : days;
  const n = bars.length;
  const max = Math.max(...bars.map((d) => d.total), 1);
  const best = bars.reduce((b, d, i) => (d.total > bars[b].total ? i : b), 0);
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o).format(parseISODate(iso));
  const isToday = (i: number) => variant === "week" && i === n - 1;
  const label = (iso: string, i: number) => {
    if (isToday(i)) return t("home.todayShort");
    if (monthly) return fmt(iso, { month: "short" });
    if (n <= 7) return fmt(iso, { weekday: "short" });
    return fmt(iso, { day: "numeric" });
  };
  // With many bars, only every few get a date underneath so the labels never collide.
  const every = n <= 16 ? 1 : Math.ceil(n / 12);
  const showLabel = (i: number) => i % every === 0 || i === n - 1;
  const fullDate = (iso: string) => (monthly ? fmt(iso, { month: "long", year: "numeric" }) : fmt(iso, { weekday: "short", day: "numeric", month: "short" }));
  const tip = (i: number) => t("home.chartTip", { date: fullDate(bars[i].date), amount: formatRupees(bars[i].total), count: bars[i].bills });
  const gap = n > 16 ? "gap-0.5 sm:gap-1" : "gap-2";

  return (
    <div>
      <div className="relative h-44" onMouseLeave={() => setActive(null)}>
        {/* Faint guide lines at the top (= the best bar, which is labelled) and middle; a solid baseline. */}
        <div aria-hidden className="absolute inset-x-0 top-6 border-t border-dashed border-slate-200" />
        <div aria-hidden className="absolute inset-x-0 top-[calc(1.5rem+50%-0.75rem)] border-t border-dashed border-slate-100" />
        <div className={cn("absolute inset-x-0 top-6 bottom-0 flex items-end justify-around border-b border-slate-300", gap)} aria-hidden>
          {bars.map((d, i) => {
            const pct = d.total > 0 ? Math.max((d.total / max) * 100, 2) : 0;
            const labelled = d.total > 0 && (i === best || isToday(i));
            // Keep the tooltip inside the chart near the left and right edges.
            const align = i < n / 4 ? "left-0" : i > (3 * n) / 4 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <div
                key={d.date}
                className="relative flex h-full w-full max-w-12 min-w-0 cursor-default flex-col items-center justify-end outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                tabIndex={0}
              >
                {labelled ? (
                  <span className="mb-1 text-xs font-semibold whitespace-nowrap text-slate-700 tabular-nums">{compactRupees(d.total)}</span>
                ) : null}
                <div
                  className={cn("w-full max-w-7 rounded-t-[4px] bg-brand-700 transition-opacity", active !== null && active !== i && "opacity-40")}
                  style={{ height: `${pct}%` }}
                />
                {active === i ? (
                  <div className={cn("pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg", align)}>
                    {tip(i)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className={cn("mt-1.5 flex justify-around", gap)} aria-hidden>
        {bars.map((d, i) => (
          <span
            key={d.date}
            className={cn("w-full max-w-12 min-w-0 text-center text-xs whitespace-nowrap", isToday(i) ? "font-semibold text-slate-800" : "text-slate-500")}
          >
            {showLabel(i) ? label(d.date, i) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption ?? t("home.last7")}</caption>
        <tbody>
          {bars.map((d, i) => (
            <tr key={d.date}>
              <td>{tip(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
