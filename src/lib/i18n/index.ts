import { en, type Messages } from "./en";
import { hi } from "./hi";

/** Locales the UI supports. The URL stays the same; the choice is kept in the `lang` cookie. */
export const locales = ["en", "hi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "lang";

const dictionaries: Record<Locale, Messages> = { en, hi };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (locales as readonly string[]).includes(v);

export function getMessages(locale: Locale = defaultLocale): Messages {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

/** English messages for places without a request locale (server actions, route handlers, manifest). */
export const t: Messages = getMessages();
export type { Messages };
