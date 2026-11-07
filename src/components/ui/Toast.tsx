import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: ReactNode;
}

type ShowToast = (message: ReactNode, tone?: ToastTone) => void;

const ToastContext = createContext<ShowToast | null>(null);

let nextId = 1;

/** Small messages near the top of the screen, e.g. "Settings saved" (kept clear of bottom action bars). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback<ShowToast>((message, tone = "success") => {
    const id = nextId++;
    setToasts((list) => [...list, { id, tone, message }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2 px-4 print:hidden"
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? CircleCheck : toast.tone === "error" ? CircleAlert : Info;
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                "pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded-xl px-4 py-3 text-[15px] font-medium text-white shadow-lg",
                toast.tone === "success" && "bg-emerald-700",
                toast.tone === "error" && "bg-red-700",
                toast.tone === "info" && "bg-slate-800",
              )}
            >
              <Icon className="mt-0.5 size-5 shrink-0" />
              <span>{toast.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}
