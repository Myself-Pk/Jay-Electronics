import { useSyncExternalStore } from "react";

/** Chrome's "this site can be installed" event (not in the standard DOM types yet). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Call once at start-up: Chrome fires the event early, before any screen is drawn. */
export function listenForInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our own "Install app" button instead of Chrome's mini bar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** Returns a function that shows Chrome's install popup, or null when the app can't be installed (or already is). */
export function useInstallApp(): (() => Promise<void>) | null {
  const available = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => deferred !== null,
  );
  if (!available) return null;
  return async () => {
    const event = deferred;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    deferred = null; // the event can only be used once
    notify();
  };
}
