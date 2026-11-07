import type { ReactNode } from "react";
import { Lock, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { canSeeOwnerData } from "@/data/types";
import { useSession } from "./SessionProvider";

/** Shows its content only to the owner (and admin). Staff see a friendly lock screen instead. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { person, switchPerson } = useSession();
  if (canSeeOwnerData(person?.role)) return <>{children}</>;

  return (
    <div className="flex justify-center pt-4 sm:pt-10">
      <Card className="w-full max-w-md px-6 py-10 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <Lock className="size-7" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">{t("settings.ownerOnly")}</h1>
        <p className="mt-1 text-[15px] text-slate-600">{t("settings.ownerOnlyHint")}</p>
        <Button className="mt-6" variant="secondary" icon={UserRound} onClick={() => void switchPerson()}>
          {t("topbar.switchPerson")}
        </Button>
      </Card>
    </div>
  );
}
