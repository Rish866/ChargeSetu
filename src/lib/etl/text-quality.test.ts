import { describe, expect, it } from "vitest";
import { unreadableFields, unreadableReason } from "./text-quality";

// Patterns copied from the kinds of garbling found in the BEE PDF extraction (shortened).
const GARBLED = {
  mojibake: "ĞƚŝŵͲWŽŵďƵƌƉĂZĚ͕ůƚŽ",
  shortMojibake: "dǇĂƐƐĂƌ",
  controlAndShifted: "\u0005@MF@KNQD\u0003\u0011NQSG\u0003\u0005DMF@KTQT",
  districtInWrongEncoding: ":ĂůƉĂŝŐƵƌŝ\u0003",
  shiftedWithCombining: "TM@KGRGNON͘DBSNQ͠HQNKH@UH",
  replacement: "Main Road \uFFFD\uFFFD Nagar",
  privateUse: "Shop \uE012\uE013 Market",
  cyrillic: "Сектор 5, Нагар",
};

const READABLE = [
  "Gennext Motors , Pahargaon, Ground Floor New, Port Blair 744103",
  "Tata Power – Goa", // en dash used in derived names
  "OPP META STRIP, NATIONAL HIGHWAY 17B, , City=SANCOALE, District=SOUTH GOA, State=Goa",
  "B`LORE HONNAVAR ROAD, #, City=TUMKUR", // odd but readable source typo
  "Contact: ops@example.com, Sector 21", // a single @ in an email
  "Café Coffee Day, MG Road", // Latin-1 accent
  "Devadānappatti, Dindigul", // transliteration macron (ā)
  "Kīrtī Nagar, Ūdupi, Ōld Gōa Road, Ēluru", // all five macron vowels
  "शिवाजी नगर, पुणे", // Devanagari on its own is readable
  "அண்ணா நகர், சென்னை", // Tamil
  "Line one\nline two\ttabbed",
  "",
];

describe("unreadableReason", () => {
  it("flags every garbling pattern seen in the source", () => {
    expect(unreadableReason(GARBLED.mojibake)).toBe("mojibake_characters");
    expect(unreadableReason(GARBLED.shortMojibake)).toBe("mojibake_characters");
    expect(unreadableReason(GARBLED.controlAndShifted)).toBe("control_characters");
    expect(unreadableReason(GARBLED.districtInWrongEncoding)).toBe("control_characters");
    expect(unreadableReason(GARBLED.shiftedWithCombining)).not.toBeNull();
    expect(unreadableReason(GARBLED.replacement)).toBe("replacement_or_private_use_characters");
    expect(unreadableReason(GARBLED.privateUse)).toBe("replacement_or_private_use_characters");
    expect(unreadableReason(GARBLED.cyrillic)).toBe("mojibake_characters");
  });

  it("detects letters shifted by one even without other symbols", () => {
    expect(unreadableReason("B@MF@KNQD M@F@Q")).toBe("shifted_ascii");
  });

  it("does not flag readable addresses, native Indian scripts, emails or accents", () => {
    for (const t of READABLE) expect(unreadableReason(t), JSON.stringify(t)).toBeNull();
    expect(unreadableReason(null)).toBeNull();
    expect(unreadableReason(undefined)).toBeNull();
  });
});

describe("unreadableFields", () => {
  it("reports which fields are unreadable", () => {
    const rec = { station_name: "BPCL – Town", operator: "BPCL", district: GARBLED.districtInWrongEncoding, city: "Town", address: GARBLED.mojibake };
    expect(unreadableFields(rec)).toEqual(["district", "address"]);
    expect(unreadableFields({ ...rec, district: "North Goa", address: "Main Road" })).toEqual([]);
  });
});
