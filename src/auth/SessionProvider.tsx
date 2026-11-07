import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getPerson } from "@/data/people";
import type { LoginPerson, Person } from "@/data/types";
import { isValidPin } from "@/lib/validation";
import { supabase } from "@/lib/supabase";

interface Session {
  /** The person currently using the app, or null when nobody is logged in. */
  person: Person | null;
  loading: boolean;
  /** Returns false when the PIN is wrong. */
  signIn: (person: LoginPerson, pin: string) => Promise<boolean>;
  /** Log out so someone else can log in (the "Billing by" switch). */
  switchPerson: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

const PREVIEW_KEY = "je-preview-person";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);

  // On start-up: pick up whoever was logged in last time on this computer.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        if (!supabase) {
          const id = localStorage.getItem(PREVIEW_KEY);
          const found = id ? await getPerson(id) : null;
          if (!cancelled) setPerson(found?.active ? found : null);
          return;
        }
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        const found = userId ? await getPerson(userId) : null;
        if (!cancelled) setPerson(found?.active ? found : null);
      } catch (err) {
        console.error(err);
        if (!cancelled) setPerson(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (who: LoginPerson, pin: string) => {
    if (!isValidPin(pin)) return false;
    if (!supabase) {
      // Preview mode: any 6-digit PIN works.
      const found = await getPerson(who.id);
      if (!found) return false;
      localStorage.setItem(PREVIEW_KEY, found.id);
      setPerson(found);
      return true;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: who.loginEmail, password: pin });
    if (error || !data.user) return false;
    const found = await getPerson(data.user.id);
    if (!found?.active) {
      await supabase.auth.signOut();
      return false;
    }
    setPerson(found);
    return true;
  }, []);

  const switchPerson = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    else localStorage.removeItem(PREVIEW_KEY);
    setPerson(null);
  }, []);

  return (
    <SessionContext.Provider value={{ person, loading, signIn, switchPerson }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
