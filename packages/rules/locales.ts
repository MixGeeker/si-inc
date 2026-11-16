export const localeNames = { "zh-CN": "简体中文", en: "English" } as const
export type Locale = keyof typeof localeNames
export const defaultLocale: Locale = "zh-CN"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(localeNames, value)
}
