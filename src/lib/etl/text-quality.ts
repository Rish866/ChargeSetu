/**
 * Detects text that was garbled when the BEE list was extracted from its PDF
 * (wrong font encoding). Examples seen in the source:
 *   "ĞƚŝŵͲWŽŵďƵƌƉĂ…"            — Latin Extended / IPA / Greek "mojibake"
 *   "\x05@MF@KNQD\x03\x11NQSG…"  — control characters + letters shifted by one
 *   ":ĂůƉĂŝŐƵƌŝ\x03"            — a district name ("Jalpaiguri") in the wrong encoding
 *
 * Such records are kept (the original text is never altered) but marked
 * private / level C, so they cannot be imported for publication until a person
 * corrects them. Native Indian scripts (Devanagari, Tamil, …) on their own are
 * NOT treated as unreadable.
 *
 * No imports: this file is shared by the ETL scripts (plain Node) and the app.
 */

const RULES: Array<{ id: string; re: RegExp; min: number }> = [
  // C0 controls except tab/newline/CR, DEL and C1 controls — never valid in an address.
  { id: "control_characters", re: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, min: 1 },
  // Replacement character and private-use glyphs left behind by broken font mappings.
  { id: "replacement_or_private_use_characters", re: /[\uFFFD\uE000-\uF8FF]/g, min: 1 },
  // Latin Extended-A/B, IPA, spacing modifiers, combining marks, Greek, Cyrillic:
  // not used in this English-language Indian list; they appear only as mojibake.
  // Exception: the macron vowels ā ē ī ō ū (Ā Ē Ī Ō Ū) used in transliterated Indian
  // place names, e.g. "Devadānappatti".
  { id: "mojibake_characters", re: /(?![\u0100\u0101\u0112\u0113\u012A\u012B\u014C\u014D\u016A\u016B])[\u0100-\u036F\u0370-\u03FF\u0400-\u04FF]/g, min: 1 },
  // Letters shifted down by one code point turn "A" into "@": "B@MF@KNQD" (= "Bangalore").
  { id: "shifted_ascii", re: /[A-Z]@(?=[A-Z])/g, min: 3 },
];

/** Returns the first rule the text breaks, or null when it looks readable. */
export function unreadableReason(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const r of RULES) {
    const hits = text.match(r.re);
    if (hits && hits.length >= r.min) return r.id;
  }
  return null;
}

export const TEXT_FIELDS_CHECKED = ["station_name", "operator", "district", "city", "address"] as const;

/** Names of the fields (from `fields`) whose text is unreadable. */
export function unreadableFields(record: Record<string, unknown>, fields: readonly string[] = TEXT_FIELDS_CHECKED): string[] {
  return fields.filter((f) => {
    const v = record[f];
    return typeof v === "string" && unreadableReason(v) !== null;
  });
}

export const UNREADABLE_FLAG = "unreadable_text_in_source";
