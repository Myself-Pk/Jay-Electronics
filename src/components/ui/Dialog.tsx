import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md";
  /** Hide the ✕ button (used by confirmation popups, which need a clear yes/no). */
  hideClose?: boolean;
}

/** A popup window. Uses the browser's own <dialog>, so Esc and keyboard focus work out of the box. */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", hideClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(
        "m-auto w-[min(92vw,var(--dialog-width))] rounded-2xl bg-white p-0 text-slate-900 shadow-2xl",
        size === "sm" ? "[--dialog-width:26rem]" : "[--dialog-width:34rem]",
      )}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start gap-3 px-6 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{title}</h2>
              {description ? <p className="mt-1 text-[15px] text-slate-600">{description}</p> : null}
            </div>
            {hideClose ? null : (
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="-mr-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
          {children ? <div className="overflow-y-auto px-6 py-2">{children}</div> : null}
          {footer ? (
            <div className="flex flex-col-reverse gap-2 px-6 pt-3 pb-5 sm:flex-row sm:justify-end">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
