import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { hi } from "./hi";

export type Language = "en" | "hi";

const STORAGE_KEY = "je-language";

function savedLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: savedLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = i18n.language;

export function setLanguage(language: Language) {
  void i18n.changeLanguage(language);
  document.documentElement.lang = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Private browsing: language just won't be remembered.
  }
}

export default i18n;
