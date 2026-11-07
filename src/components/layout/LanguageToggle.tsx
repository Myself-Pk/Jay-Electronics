import { useTranslation } from "react-i18next";
import { Segmented } from "@/components/ui/Segmented";
import { setLanguage, type Language } from "@/i18n";

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return (
    <Segmented<Language>
      label={t("topbar.language")}
      value={i18n.language === "hi" ? "hi" : "en"}
      onChange={setLanguage}
      options={[
        { value: "en", label: "EN" },
        { value: "hi", label: "हिं" },
      ]}
    />
  );
}
