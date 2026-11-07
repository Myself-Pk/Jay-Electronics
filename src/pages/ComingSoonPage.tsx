import { CalendarClock, House } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/dates";
import { FEATURES, type FeatureKey } from "./comingSoon";

/** Placeholder for parts of the app that are still being built. Shows Papa what's coming and when. */
export function ComingSoonPage({ feature }: { feature: FeatureKey }) {
  const { t, i18n } = useTranslation();
  const { icon: Icon, readyBy } = FEATURES[feature];

  return (
    <div className="flex justify-center pt-4 sm:pt-10">
      <Card className="w-full max-w-xl px-6 py-10 text-center sm:px-10">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-800">
          <Icon className="size-8" />
        </span>
        <Badge tone="amber" className="mt-5">
          {t("comingSoon.beingBuilt")}
        </Badge>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">{t(`comingSoon.features.${feature}.title`)}</h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-slate-600">{t(`comingSoon.features.${feature}.text`)}</p>
        <p className="mt-5 inline-flex items-center gap-2 text-[15px] font-semibold text-slate-800">
          <CalendarClock className="size-5 text-brand-700" />
          {t("comingSoon.readyBy", { date: formatDate(readyBy, i18n.language) })}
        </p>
        <div className="mt-8">
          <LinkButton to="/" variant="secondary" icon={House}>
            {t("comingSoon.goHome")}
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
