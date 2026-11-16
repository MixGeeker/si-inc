import type { Locale } from "../../../../packages/rules/locales.ts"
import { en as englishScenario } from "../../../../packages/rules/v0.1/locales/en.ts"
import { zhCN as chineseScenario, type ScenarioText } from "../../../../packages/rules/v0.1/locales/zh-CN.ts"
import { en } from "./en.ts"
import { zhCN } from "./zh-CN.ts"

function language(locale: Locale, ui: typeof zhCN, scenario: ScenarioText) {
  return {
    locale, ui, scenario,
    number: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    fixed: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    percent: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }),
    date: new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" }),
    country: new Intl.DisplayNames(locale, { type: "region" }),
  }
}

export const languages = {
  "zh-CN": language("zh-CN", zhCN, chineseScenario),
  en: language("en", en, englishScenario),
} satisfies Record<Locale, ReturnType<typeof language>>
export type Language = ReturnType<typeof language>
