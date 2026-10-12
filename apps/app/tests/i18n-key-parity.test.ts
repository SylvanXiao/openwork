import { describe, expect, test } from "bun:test";

import en from "../src/i18n/locales/en.ts";
import zh from "../src/i18n/locales/zh.ts";

/**
 * Locale files are flat maps: { "ui_some_key": "text", "section.key": "text" }.
 * Guards the i18n contract so the zh translation never drifts from en:
 *   1. every en key exists in zh (no missing translations)
 *   2. no zh value is empty
 *   3. {placeholders} in a shared key match between en and zh
 */

type Locale = Record<string, string>;

const enLocale = en as unknown as Locale;
const zhLocale = zh as unknown as Locale;

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe("i18n locale parity (en <-> zh)", () => {
  test("zh defines every key en defines", () => {
    const missing = Object.keys(enLocale).filter((key) => !(key in zhLocale));
    expect(missing).toEqual([]);
  });

  test("zh has no empty or non-string values", () => {
    const broken = Object.keys(zhLocale).filter(
      (key) => typeof zhLocale[key] !== "string" || zhLocale[key].trim() === "",
    );
    expect(broken).toEqual([]);
  });

  test("placeholders match between en and zh for shared keys", () => {
    const mismatched = Object.keys(enLocale)
      .filter((key) => key in zhLocale)
      .map((key) => ({
        key,
        en: placeholders(enLocale[key]).join(","),
        zh: placeholders(zhLocale[key]).join(","),
      }))
      .filter((entry) => entry.en !== entry.zh);
    expect(mismatched).toEqual([]);
  });
});
