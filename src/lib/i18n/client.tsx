"use client";

import { createContext, useContext, type ReactNode } from "react";
import { en } from "./en";
import { hi } from "./hi";
import type { Locale, Messages } from "./index";

const LocaleContext = createContext<Locale>("en");
const dictionaries: Record<Locale, Messages> = { en, hi };

/** Provides the request locale to Client Components (set once in the root layout). */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** UI strings for Client Components. */
export function useT(): Messages {
  return dictionaries[useContext(LocaleContext)] ?? en;
}
