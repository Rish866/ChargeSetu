import { en, type Messages } from "./en";

/**
 * Locales the UI supports today. Planned: "hi" (Hindi) and "mr" (Marathi).
 * Add a dictionary file, then add it here and to `dictionaries`.
 */
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

const dictionaries: Record<Locale, Messages> = { en };

export function getMessages(locale: Locale = defaultLocale): Messages {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

/** Default-locale messages, usable from both server and client components. */
export const t: Messages = getMessages();
