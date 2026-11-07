import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmOptions {
  title: ReactNode;
  message?: ReactNode;
  /** A plain summary of what will change, e.g. [{ label: "Amaron 150Ah", value: "8 → 7" }] */
  lines?: { label: ReactNode; value: ReactNode }[];
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: "primary" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * The app-wide "Are you sure?" popup.
 * Rule: anything that changes money or stock asks first, with a plain summary.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Save bill?", lines: [...] })) { ... }
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => finish(false)}
        title={options?.title}
        description={options?.message}
        size="sm"
        hideClose
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => finish(false)}>
              {options?.cancelLabel ?? t("common.cancel")}
            </Button>
            <Button
              variant={options?.tone === "danger" ? "danger" : "primary"}
              size="lg"
              onClick={() => finish(true)}
            >
              {options?.confirmLabel ?? t("common.confirm")}
            </Button>
          </>
        }
      >
        {options?.lines?.length ? (
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
            {options.lines.map((line, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[15px]">
                <dt className="text-slate-600">{line.label}</dt>
                <dd className="font-semibold text-slate-900 tabular-nums">{line.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return confirm;
}
