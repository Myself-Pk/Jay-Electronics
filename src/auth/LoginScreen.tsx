import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/layout/BrandMark";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { listLoginPeople } from "@/data/people";
import type { LoginPerson } from "@/data/types";
import { cn } from "@/lib/cn";
import { isPreview } from "@/lib/supabase";
import { useAsync } from "@/lib/useAsync";
import { PinPad } from "./PinPad";
import { useSession } from "./SessionProvider";

const avatarColours = ["bg-brand-100 text-brand-900", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-900", "bg-rose-100 text-rose-800"];

export function Avatar({ name, index = 0, className }: { name: string; index?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold",
        avatarColours[index % avatarColours.length],
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** "Who is using the app?" → tap your name → enter your PIN. */
export function LoginScreen() {
  const { t } = useTranslation();
  const { signIn } = useSession();
  const people = useAsync(listLoginPeople);
  const [chosen, setChosen] = useState<LoginPerson | null>(null);
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);

  const tryPin = async (value: string) => {
    if (!chosen) return;
    setChecking(true);
    const ok = await signIn(chosen, value).catch(() => false);
    setChecking(false);
    if (!ok) {
      setWrong(true);
      window.setTimeout(() => {
        setPin("");
        setWrong(false);
      }, 700);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <BrandMark />
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0">
        <Card className="w-full max-w-lg p-6 sm:p-8">
          {!chosen ? (
            <>
              <h1 className="text-center text-2xl font-bold text-slate-900">{t("login.whoIsUsing")}</h1>
              <p className="mt-1 text-center text-slate-500">{t("login.tapYourName")}</p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {people.loading
                  ? Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                    ))
                  : (people.data ?? []).map((person, i) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => setChosen(person)}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                      >
                        <Avatar name={person.name} index={i} />
                        <span className="min-w-0">
                          <span className="block truncate text-[17px] font-semibold text-slate-900">{person.name}</span>
                          <span className="block text-sm text-slate-500">{t(`common.roles.${person.role}`)}</span>
                        </span>
                      </button>
                    ))}
              </div>
              {!people.loading && (people.data ?? []).length === 0 ? (
                <p className="mt-6 text-center text-slate-600">{t("login.noPeople")}</p>
              ) : null}
              {people.error ? <p className="mt-6 text-center text-red-600">{t("common.somethingWrong")}</p> : null}
            </>
          ) : (
            <div className="flex flex-col items-center">
              <Avatar
                name={chosen.name}
                index={(people.data ?? []).findIndex((p) => p.id === chosen.id)}
                className="size-16 text-2xl"
              />
              <h1 className="mt-3 text-center text-xl font-bold text-slate-900">
                {t("login.enterPin", { name: chosen.name })}
              </h1>
              <p className={cn("mt-1 h-6 text-center text-[15px]", wrong ? "text-red-600" : "text-slate-500")}>
                {wrong ? t("login.wrongPin") : isPreview ? t("login.previewHint") : ""}
              </p>
              <div className="mt-5 w-full">
                <PinPad value={pin} onChange={setPin} onComplete={tryPin} disabled={checking || wrong} error={wrong} />
              </div>
              <Button
                variant="ghost"
                icon={ArrowLeft}
                className="mt-6"
                onClick={() => {
                  setChosen(null);
                  setPin("");
                }}
              >
                {t("login.chooseAnother")}
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
