import { lang } from "next/root-params";
import { defaultLocale, getMessages, isLocale, type Locale, type Messages } from "./index";

/** Current UI locale for this request (from the `[lang]` root segment). Server Components only. */
export async function getLocale(): Promise<Locale> {
  const l = await lang();
  return isLocale(l) ? l : defaultLocale;
}

/** UI strings for the current request. Server Components only. */
export async function getT(): Promise<Messages> {
  return getMessages(await getLocale());
}
