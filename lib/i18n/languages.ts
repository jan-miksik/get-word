import { PUBLIC_LANGUAGE_STORAGE_KEY } from "@/lib/i18n/public-language";
import { TOP_PREGENERATED_UI_LANGUAGE_CODES } from "@/lib/i18n/pre-generated-languages";

export type SupportedLanguage = {
  code: string;
  name: string;
  flag?: string;
  source?: "common" | "google";
};

export const DEFAULT_SETTINGS_LANGUAGE = "en";
const LEGACY_LANGUAGE_ALIASES: Record<string, string> = {
  cz: "cs",
};

export const COMMON_LANGUAGES: SupportedLanguage[] = [
  { code: "en", name: "English", flag: "🇬🇧", source: "common" },
  { code: "cs", name: "Czech", flag: "🇨🇿", source: "common" },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳", source: "common" },
  { code: "de", name: "German", flag: "🇩🇪", source: "common" },
  { code: "es", name: "Spanish", flag: "🇪🇸", source: "common" },
  { code: "fr", name: "French", flag: "🇫🇷", source: "common" },
  { code: "it", name: "Italian", flag: "🇮🇹", source: "common" },
  { code: "pl", name: "Polish", flag: "🇵🇱", source: "common" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹", source: "common" },
  { code: "uk", name: "Ukrainian", flag: "🇺🇦", source: "common" },
  { code: "ru", name: "Russian", flag: "🇷🇺", source: "common" },
  { code: "ja", name: "Japanese", flag: "🇯🇵", source: "common" },
  { code: "ko", name: "Korean", flag: "🇰🇷", source: "common" },
  { code: "zh-CN", name: "Chinese (Simplified)", flag: "🇨🇳", source: "common" },
  { code: "ar", name: "Arabic", flag: "🇸🇦", source: "common" },
];

const MOST_USED_SETTINGS_LANGUAGE_CODES = [
  "cs",
  "vi",
  "en",
  "uk",
  ...TOP_PREGENERATED_UI_LANGUAGE_CODES.filter(
    (code) => !["cs", "vi", "en", "uk"].includes(normalizeLanguageCode(code)),
  ),
] as const;

// Google Cloud Translation NMT supported languages, mirrored from:
// https://docs.cloud.google.com/translate/docs/languages (last checked 2026-05-01).
export const GOOGLE_TRANSLATE_LANGUAGES: SupportedLanguage[] = [
  { code: "ab", name: "Abkhaz", source: "google" },
  { code: "ace", name: "Acehnese", source: "google" },
  { code: "ach", name: "Acholi", source: "google" },
  { code: "af", name: "Afrikaans", source: "google" },
  { code: "sq", name: "Albanian", source: "google" },
  { code: "alz", name: "Alur", source: "google" },
  { code: "am", name: "Amharic", source: "google" },
  { code: "ar", name: "Arabic", source: "google" },
  { code: "hy", name: "Armenian", source: "google" },
  { code: "as", name: "Assamese", source: "google" },
  { code: "awa", name: "Awadhi", source: "google" },
  { code: "ay", name: "Aymara", source: "google" },
  { code: "az", name: "Azerbaijani", source: "google" },
  { code: "ban", name: "Balinese", source: "google" },
  { code: "bm", name: "Bambara", source: "google" },
  { code: "ba", name: "Bashkir", source: "google" },
  { code: "eu", name: "Basque", source: "google" },
  { code: "btx", name: "Batak Karo", source: "google" },
  { code: "bts", name: "Batak Simalungun", source: "google" },
  { code: "bbc", name: "Batak Toba", source: "google" },
  { code: "be", name: "Belarusian", source: "google" },
  { code: "bem", name: "Bemba", source: "google" },
  { code: "bn", name: "Bengali", source: "google" },
  { code: "bew", name: "Betawi", source: "google" },
  { code: "bho", name: "Bhojpuri", source: "google" },
  { code: "bik", name: "Bikol", source: "google" },
  { code: "bs", name: "Bosnian", source: "google" },
  { code: "br", name: "Breton", source: "google" },
  { code: "bg", name: "Bulgarian", source: "google" },
  { code: "bua", name: "Buryat", source: "google" },
  { code: "yue", name: "Cantonese", source: "google" },
  { code: "ca", name: "Catalan", source: "google" },
  { code: "ceb", name: "Cebuano", source: "google" },
  { code: "ny", name: "Chichewa (Nyanja)", source: "google" },
  { code: "zh-CN", name: "Chinese (Simplified)", source: "google" },
  { code: "zh-TW", name: "Chinese (Traditional)", source: "google" },
  { code: "cv", name: "Chuvash", source: "google" },
  { code: "co", name: "Corsican", source: "google" },
  { code: "crh", name: "Crimean Tatar", source: "google" },
  { code: "hr", name: "Croatian", source: "google" },
  { code: "cs", name: "Czech", source: "google" },
  { code: "da", name: "Danish", source: "google" },
  { code: "din", name: "Dinka", source: "google" },
  { code: "dv", name: "Divehi", source: "google" },
  { code: "doi", name: "Dogri", source: "google" },
  { code: "dov", name: "Dombe", source: "google" },
  { code: "nl", name: "Dutch", source: "google" },
  { code: "dz", name: "Dzongkha", source: "google" },
  { code: "en", name: "English", source: "google" },
  { code: "eo", name: "Esperanto", source: "google" },
  { code: "et", name: "Estonian", source: "google" },
  { code: "ee", name: "Ewe", source: "google" },
  { code: "fj", name: "Fijian", source: "google" },
  { code: "fil", name: "Filipino (Tagalog)", source: "google" },
  { code: "fi", name: "Finnish", source: "google" },
  { code: "fr", name: "French", source: "google" },
  { code: "fr-FR", name: "French (French)", source: "google" },
  { code: "fr-CA", name: "French (Canadian)", source: "google" },
  { code: "fy", name: "Frisian", source: "google" },
  { code: "ff", name: "Fulfulde", source: "google" },
  { code: "gaa", name: "Ga", source: "google" },
  { code: "gl", name: "Galician", source: "google" },
  { code: "lg", name: "Ganda (Luganda)", source: "google" },
  { code: "ka", name: "Georgian", source: "google" },
  { code: "de", name: "German", source: "google" },
  { code: "el", name: "Greek", source: "google" },
  { code: "gn", name: "Guarani", source: "google" },
  { code: "gu", name: "Gujarati", source: "google" },
  { code: "ht", name: "Haitian Creole", source: "google" },
  { code: "cnh", name: "Hakha Chin", source: "google" },
  { code: "ha", name: "Hausa", source: "google" },
  { code: "haw", name: "Hawaiian", source: "google" },
  { code: "he", name: "Hebrew", source: "google" },
  { code: "hil", name: "Hiligaynon", source: "google" },
  { code: "hi", name: "Hindi", source: "google" },
  { code: "hmn", name: "Hmong", source: "google" },
  { code: "hu", name: "Hungarian", source: "google" },
  { code: "hrx", name: "Hunsrik", source: "google" },
  { code: "is", name: "Icelandic", source: "google" },
  { code: "ig", name: "Igbo", source: "google" },
  { code: "ilo", name: "Iloko", source: "google" },
  { code: "id", name: "Indonesian", source: "google" },
  { code: "ga", name: "Irish", source: "google" },
  { code: "it", name: "Italian", source: "google" },
  { code: "ja", name: "Japanese", source: "google" },
  { code: "jv", name: "Javanese", source: "google" },
  { code: "kn", name: "Kannada", source: "google" },
  { code: "pam", name: "Kapampangan", source: "google" },
  { code: "kk", name: "Kazakh", source: "google" },
  { code: "km", name: "Khmer", source: "google" },
  { code: "cgg", name: "Kiga", source: "google" },
  { code: "rw", name: "Kinyarwanda", source: "google" },
  { code: "ktu", name: "Kituba", source: "google" },
  { code: "gom", name: "Konkani", source: "google" },
  { code: "ko", name: "Korean", source: "google" },
  { code: "kri", name: "Krio", source: "google" },
  { code: "ku", name: "Kurdish (Kurmanji)", source: "google" },
  { code: "ckb", name: "Kurdish (Sorani)", source: "google" },
  { code: "ky", name: "Kyrgyz", source: "google" },
  { code: "lo", name: "Lao", source: "google" },
  { code: "ltg", name: "Latgalian", source: "google" },
  { code: "la", name: "Latin", source: "google" },
  { code: "lv", name: "Latvian", source: "google" },
  { code: "lij", name: "Ligurian", source: "google" },
  { code: "li", name: "Limburgan", source: "google" },
  { code: "ln", name: "Lingala", source: "google" },
  { code: "lt", name: "Lithuanian", source: "google" },
  { code: "lmo", name: "Lombard", source: "google" },
  { code: "luo", name: "Luo", source: "google" },
  { code: "lb", name: "Luxembourgish", source: "google" },
  { code: "mk", name: "Macedonian", source: "google" },
  { code: "mai", name: "Maithili", source: "google" },
  { code: "mak", name: "Makassar", source: "google" },
  { code: "mg", name: "Malagasy", source: "google" },
  { code: "ms", name: "Malay", source: "google" },
  { code: "ms-Arab", name: "Malay (Jawi)", source: "google" },
  { code: "ml", name: "Malayalam", source: "google" },
  { code: "mt", name: "Maltese", source: "google" },
  { code: "mi", name: "Maori", source: "google" },
  { code: "mr", name: "Marathi", source: "google" },
  { code: "chm", name: "Meadow Mari", source: "google" },
  { code: "mni-Mtei", name: "Meiteilon (Manipuri)", source: "google" },
  { code: "min", name: "Minang", source: "google" },
  { code: "lus", name: "Mizo", source: "google" },
  { code: "mn", name: "Mongolian", source: "google" },
  { code: "my", name: "Myanmar (Burmese)", source: "google" },
  { code: "nr", name: "Ndebele (South)", source: "google" },
  { code: "new", name: "Nepalbhasa (Newari)", source: "google" },
  { code: "ne", name: "Nepali", source: "google" },
  { code: "nso", name: "Northern Sotho (Sepedi)", source: "google" },
  { code: "no", name: "Norwegian", source: "google" },
  { code: "nus", name: "Nuer", source: "google" },
  { code: "oc", name: "Occitan", source: "google" },
  { code: "or", name: "Odia (Oriya)", source: "google" },
  { code: "om", name: "Oromo", source: "google" },
  { code: "pag", name: "Pangasinan", source: "google" },
  { code: "pap", name: "Papiamento", source: "google" },
  { code: "ps", name: "Pashto", source: "google" },
  { code: "fa", name: "Persian", source: "google" },
  { code: "pl", name: "Polish", source: "google" },
  { code: "pt", name: "Portuguese", source: "google" },
  { code: "pt-PT", name: "Portuguese (Portugal)", source: "google" },
  { code: "pt-BR", name: "Portuguese (Brazil)", source: "google" },
  { code: "pa", name: "Punjabi", source: "google" },
  { code: "pa-Arab", name: "Punjabi (Shahmukhi)", source: "google" },
  { code: "qu", name: "Quechua", source: "google" },
  { code: "rom", name: "Romani", source: "google" },
  { code: "ro", name: "Romanian", source: "google" },
  { code: "rn", name: "Rundi", source: "google" },
  { code: "ru", name: "Russian", source: "google" },
  { code: "sm", name: "Samoan", source: "google" },
  { code: "sg", name: "Sango", source: "google" },
  { code: "sa", name: "Sanskrit", source: "google" },
  { code: "gd", name: "Scots Gaelic", source: "google" },
  { code: "sr", name: "Serbian", source: "google" },
  { code: "st", name: "Sesotho", source: "google" },
  { code: "crs", name: "Seychellois Creole", source: "google" },
  { code: "shn", name: "Shan", source: "google" },
  { code: "sn", name: "Shona", source: "google" },
  { code: "scn", name: "Sicilian", source: "google" },
  { code: "szl", name: "Silesian", source: "google" },
  { code: "sd", name: "Sindhi", source: "google" },
  { code: "si", name: "Sinhala (Sinhalese)", source: "google" },
  { code: "sk", name: "Slovak", source: "google" },
  { code: "sl", name: "Slovenian", source: "google" },
  { code: "so", name: "Somali", source: "google" },
  { code: "es", name: "Spanish", source: "google" },
  { code: "su", name: "Sundanese", source: "google" },
  { code: "sw", name: "Swahili", source: "google" },
  { code: "ss", name: "Swati", source: "google" },
  { code: "sv", name: "Swedish", source: "google" },
  { code: "tg", name: "Tajik", source: "google" },
  { code: "ta", name: "Tamil", source: "google" },
  { code: "tt", name: "Tatar", source: "google" },
  { code: "te", name: "Telugu", source: "google" },
  { code: "tet", name: "Tetum", source: "google" },
  { code: "th", name: "Thai", source: "google" },
  { code: "ti", name: "Tigrinya", source: "google" },
  { code: "ts", name: "Tsonga", source: "google" },
  { code: "tn", name: "Tswana", source: "google" },
  { code: "tr", name: "Turkish", source: "google" },
  { code: "tk", name: "Turkmen", source: "google" },
  { code: "ak", name: "Twi (Akan)", source: "google" },
  { code: "uk", name: "Ukrainian", source: "google" },
  { code: "ur", name: "Urdu", source: "google" },
  { code: "ug", name: "Uyghur", source: "google" },
  { code: "uz", name: "Uzbek", source: "google" },
  { code: "vi", name: "Vietnamese", source: "google" },
  { code: "cy", name: "Welsh", source: "google" },
  { code: "xh", name: "Xhosa", source: "google" },
  { code: "yi", name: "Yiddish", source: "google" },
  { code: "yo", name: "Yoruba", source: "google" },
  { code: "yua", name: "Yucatec Maya", source: "google" },
  { code: "zu", name: "Zulu", source: "google" },
];

const FLAG_BY_BASE_LANGUAGE: Record<string, string> = {
  ab: "🇬🇪",
  af: "🇿🇦",
  am: "🇪🇹",
  ar: "🇸🇦",
  as: "🇮🇳",
  ay: "🇧🇴",
  az: "🇦🇿",
  ba: "🇷🇺",
  be: "🇧🇾",
  bg: "🇧🇬",
  bm: "🇲🇱",
  bn: "🇧🇩",
  bs: "🇧🇦",
  ca: "🇪🇸",
  cs: "🇨🇿",
  cy: "🇬🇧",
  da: "🇩🇰",
  de: "🇩🇪",
  dv: "🇲🇻",
  dz: "🇧🇹",
  ee: "🇬🇭",
  el: "🇬🇷",
  en: "🇬🇧",
  es: "🇪🇸",
  et: "🇪🇪",
  eu: "🇪🇸",
  fa: "🇮🇷",
  fj: "🇫🇯",
  fil: "🇵🇭",
  fi: "🇫🇮",
  fr: "🇫🇷",
  ga: "🇮🇪",
  gd: "🇬🇧",
  gl: "🇪🇸",
  gn: "🇵🇾",
  gu: "🇮🇳",
  ha: "🇳🇬",
  haw: "🇺🇸",
  he: "🇮🇱",
  hi: "🇮🇳",
  hr: "🇭🇷",
  ht: "🇭🇹",
  hu: "🇭🇺",
  hy: "🇦🇲",
  id: "🇮🇩",
  ig: "🇳🇬",
  is: "🇮🇸",
  it: "🇮🇹",
  ja: "🇯🇵",
  jv: "🇮🇩",
  ka: "🇬🇪",
  kk: "🇰🇿",
  km: "🇰🇭",
  kn: "🇮🇳",
  ko: "🇰🇷",
  ku: "🇹🇷",
  ky: "🇰🇬",
  lb: "🇱🇺",
  lg: "🇺🇬",
  ln: "🇨🇩",
  lo: "🇱🇦",
  lt: "🇱🇹",
  lv: "🇱🇻",
  mg: "🇲🇬",
  mi: "🇳🇿",
  mk: "🇲🇰",
  ml: "🇮🇳",
  mn: "🇲🇳",
  mr: "🇮🇳",
  ms: "🇲🇾",
  mt: "🇲🇹",
  my: "🇲🇲",
  ne: "🇳🇵",
  nl: "🇳🇱",
  no: "🇳🇴",
  ny: "🇲🇼",
  om: "🇪🇹",
  or: "🇮🇳",
  pa: "🇮🇳",
  pap: "🇨🇼",
  ps: "🇦🇫",
  pt: "🇵🇹",
  qu: "🇵🇪",
  ro: "🇷🇴",
  ru: "🇷🇺",
  rw: "🇷🇼",
  si: "🇱🇰",
  sk: "🇸🇰",
  sl: "🇸🇮",
  sm: "🇼🇸",
  sn: "🇿🇼",
  so: "🇸🇴",
  sq: "🇦🇱",
  sr: "🇷🇸",
  st: "🇱🇸",
  su: "🇮🇩",
  sv: "🇸🇪",
  sw: "🇹🇿",
  ta: "🇮🇳",
  te: "🇮🇳",
  tg: "🇹🇯",
  th: "🇹🇭",
  ti: "🇪🇷",
  tk: "🇹🇲",
  tl: "🇵🇭",
  tr: "🇹🇷",
  tt: "🇷🇺",
  ug: "🇨🇳",
  uk: "🇺🇦",
  ur: "🇵🇰",
  uz: "🇺🇿",
  vi: "🇻🇳",
  xh: "🇿🇦",
  yi: "🇮🇱",
  yo: "🇳🇬",
  yue: "🇭🇰",
  zh: "🇨🇳",
  zu: "🇿🇦",
};

export function normalizeLanguageCode(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SETTINGS_LANGUAGE;
  const trimmed = value.trim();
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(trimmed)) {
    return DEFAULT_SETTINGS_LANGUAGE;
  }
  const [base, subtag] = trimmed.split("-");
  if (!subtag) return LEGACY_LANGUAGE_ALIASES[base.toLowerCase()] ?? base.toLowerCase();
  const normalizedSubtag = /^[a-z]{4}$/i.test(subtag)
    ? `${subtag[0].toUpperCase()}${subtag.slice(1).toLowerCase()}`
    : subtag.toUpperCase();
  const normalizedBase = LEGACY_LANGUAGE_ALIASES[base.toLowerCase()] ?? base.toLowerCase();
  return `${normalizedBase}-${normalizedSubtag}`;
}

export function getBaseLanguage(code: string): string {
  const rawBase = String(code).trim().split("-")[0];
  if (/^[a-z]{2,3}$/i.test(rawBase)) return rawBase.toLowerCase();
  return normalizeLanguageCode(code).split("-")[0];
}

function countryFlag(countryCode: string): string | null {
  if (!/^[a-z]{2}$/i.test(countryCode)) return null;
  return countryCode
    .toUpperCase()
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

export function getLanguageFlag(code: string): string | null {
  const normalized = normalizeLanguageCode(code);
  const [, region] = normalized.split("-");
  const regionalFlag = region ? countryFlag(region) : null;
  if (regionalFlag) return regionalFlag;
  return FLAG_BY_BASE_LANGUAGE[getBaseLanguage(normalized)] ?? null;
}

export function normalizeLanguageSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getLocalizedLanguageName(code: string, locale: string): string | null {
  try {
    return new Intl.DisplayNames(normalizeLanguageCode(locale), { type: "language" }).of(
      normalizeLanguageCode(code),
    ) ?? null;
  } catch {
    return null;
  }
}

export function getNativeLanguageName(code: string): string | null {
  const normalized = normalizeLanguageCode(code);
  return getLocalizedLanguageName(normalized, normalized);
}

export function languageMatchesSearch(
  language: SupportedLanguage,
  query: string,
  extraNames: readonly string[] = [],
): boolean {
  const rawQuery = query.trim().toLocaleLowerCase();
  if (!rawQuery) return true;
  const foldedQuery = normalizeLanguageSearchText(query);
  const code = normalizeLanguageCode(language.code);
  const names = [
    language.name,
    code,
    getNativeLanguageName(code),
    ...extraNames,
  ].filter((value): value is string => Boolean(value && value.trim()));

  return names.some((name) => {
    const rawName = name.toLocaleLowerCase();
    return (
      rawName.includes(rawQuery) ||
      (foldedQuery.length >= 2 && normalizeLanguageSearchText(name).includes(foldedQuery))
    );
  });
}

export function mergeLanguages(...groups: SupportedLanguage[][]): SupportedLanguage[] {
  const byCode = new Map<string, SupportedLanguage>();
  for (const group of groups) {
    for (const language of group) {
      const code = normalizeLanguageCode(language.code);
      if (!byCode.has(code)) {
        byCode.set(code, { ...language, code, flag: language.flag ?? getLanguageFlag(code) ?? undefined });
      }
    }
  }
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function orderSettingsLanguages(
  languages: readonly SupportedLanguage[],
): SupportedLanguage[] {
  const alphabetic = [...languages].sort((a, b) => a.name.localeCompare(b.name));
  const byCode = new Map(
    alphabetic.map((language) => [normalizeLanguageCode(language.code), language] as const),
  );
  const featured = MOST_USED_SETTINGS_LANGUAGE_CODES.flatMap((code) => {
    const language = byCode.get(normalizeLanguageCode(code));
    return language ? [language] : [];
  });
  const featuredCodes = new Set(featured.map((language) => normalizeLanguageCode(language.code)));
  return [
    ...featured,
    ...alphabetic.filter((language) => !featuredCodes.has(normalizeLanguageCode(language.code))),
  ];
}

export function findBestSupportedLanguage(
  preferredLanguages: readonly string[],
  supportedLanguages: readonly SupportedLanguage[] = COMMON_LANGUAGES,
): string {
  const supportedCodes = new Set(supportedLanguages.map((language) => normalizeLanguageCode(language.code)));
  const baseToCode = new Map<string, string>();
  for (const code of supportedCodes) {
    baseToCode.set(getBaseLanguage(code), code);
  }
  for (const preferred of preferredLanguages) {
    const normalized = normalizeLanguageCode(preferred);
    const isValidExact = normalized !== DEFAULT_SETTINGS_LANGUAGE || /^en(?:-|$)/i.test(preferred);
    if (isValidExact && supportedCodes.has(normalized)) return normalized;
    const looseBaseMatch = baseToCode.get(getBaseLanguage(preferred));
    if (looseBaseMatch) return looseBaseMatch;
    const baseMatch = baseToCode.get(getBaseLanguage(normalized));
    if (baseMatch) return baseMatch;
  }
  return DEFAULT_SETTINGS_LANGUAGE;
}

export function getBrowserLanguageCandidates(): string[] {
  if (typeof navigator === "undefined") return [DEFAULT_SETTINGS_LANGUAGE];
  const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
  return [...languages, navigator.language].filter((value): value is string => Boolean(value));
}

/**
 * The language the visitor picked on the public landing page, if any. It is
 * stored client-side and acts as an explicit, cross-page preference that should
 * win over passive browser detection when no settings language was chosen yet.
 */
function getStoredPublicLanguage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(PUBLIC_LANGUAGE_STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function getDetectedSettingsLanguage(
  supportedLanguages: readonly SupportedLanguage[] = COMMON_LANGUAGES,
): string {
  const stored = getStoredPublicLanguage();
  const candidates = stored
    ? [stored, ...getBrowserLanguageCandidates()]
    : getBrowserLanguageCandidates();
  return findBestSupportedLanguage(candidates, supportedLanguages);
}

export function isSimulatedFirstOpenEnabled(): boolean {
  const rawValue = process.env.NEXT_PUBLIC_GET_WORD_SIMULATE_FIRST_OPEN?.trim().toLowerCase();
  return rawValue === "1" || rawValue === "true";
}
