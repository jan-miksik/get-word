import { getBaseLanguage, getLocalizedLanguageName, normalizeLanguageCode } from "@/lib/i18n/languages";

/**
 * Czech asks "Jak dobře umíš anglicky?" with an adverb, and the adverb cannot be
 * derived from the noun Intl gives us: "angličtina" → "anglicky", "němčina" →
 * "německy", "lotyština" → "lotyšsky". So the forms are listed rather than
 * generated, and a language missing from the list simply gets the question that
 * does not name it.
 */
const CZECH_SPEAK_ADVERBS: Record<string, string> = {
  af: "afrikánsky",
  am: "amharsky",
  ar: "arabsky",
  az: "ázerbájdžánsky",
  be: "bělorusky",
  bg: "bulharsky",
  bn: "bengálsky",
  bs: "bosensky",
  ca: "katalánsky",
  cs: "česky",
  cy: "velšsky",
  da: "dánsky",
  de: "německy",
  el: "řecky",
  en: "anglicky",
  eo: "esperantsky",
  es: "španělsky",
  et: "estonsky",
  eu: "baskicky",
  fa: "persky",
  fi: "finsky",
  fr: "francouzsky",
  ga: "irsky",
  gl: "galicijsky",
  gu: "gudžarátsky",
  he: "hebrejsky",
  hi: "hindsky",
  hr: "chorvatsky",
  hu: "maďarsky",
  hy: "arménsky",
  id: "indonésky",
  is: "islandsky",
  it: "italsky",
  ja: "japonsky",
  ka: "gruzínsky",
  kk: "kazašsky",
  km: "khmersky",
  kn: "kannadsky",
  ko: "korejsky",
  la: "latinsky",
  lo: "laosky",
  lt: "litevsky",
  lv: "lotyšsky",
  mk: "makedonsky",
  ml: "malajálamsky",
  mn: "mongolsky",
  mr: "maráthsky",
  ms: "malajsky",
  my: "barmsky",
  ne: "nepálsky",
  nl: "nizozemsky",
  no: "norsky",
  pa: "paňdžábsky",
  pl: "polsky",
  pt: "portugalsky",
  ro: "rumunsky",
  ru: "rusky",
  si: "sinhálsky",
  sk: "slovensky",
  sl: "slovinsky",
  sq: "albánsky",
  sr: "srbsky",
  sv: "švédsky",
  sw: "svahilsky",
  ta: "tamilsky",
  te: "telugsky",
  th: "thajsky",
  tl: "filipínsky",
  tr: "turecky",
  uk: "ukrajinsky",
  ur: "urdsky",
  uz: "uzbecky",
  vi: "vietnamsky",
  zh: "čínsky",
};

/** Intl labels a regional variant as "Chinese (China)", which no sentence wants. */
function plainDisplayName(target: string, locale: string): string | null {
  const name = getLocalizedLanguageName(target, locale);
  if (!name) return null;
  const withoutRegion = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!withoutRegion) return null;
  // Intl returns the bare code when the locale has no name for the language;
  // "How well do you know ace?" is worse than not naming it at all.
  if (withoutRegion.toLowerCase() === normalizeLanguageCode(target).toLowerCase()) return null;
  return withoutRegion;
}

/**
 * The language being learned, in the form it takes inside "How well do you
 * know …?" — an adverb in Czech, the accusative in Ukrainian, the plain name
 * elsewhere. Returns null when we cannot vouch for the form in this UI locale,
 * and the caller then asks the question without naming the language.
 */
export function getLanguageQuestionForm(
  targetLanguage: string | null | undefined,
  uiLocale: string | null | undefined,
): string | null {
  if (!targetLanguage) return null;
  const locale = getBaseLanguage(uiLocale || "en");

  if (locale === "cs") {
    return CZECH_SPEAK_ADVERBS[getBaseLanguage(targetLanguage)] ?? null;
  }

  const name = plainDisplayName(targetLanguage, locale);
  if (!name) return null;

  if (locale === "uk") {
    // Ukrainian names languages with a feminine adjective ("англійська"), whose
    // accusative swaps the final vowel; indeclinable ones ("гінді") stay put.
    return name.endsWith("а") ? `${name.slice(0, -1)}у` : name;
  }
  if (locale === "vi") {
    // "Tiếng Anh" is capitalised as a standalone label but not mid-sentence.
    return name.charAt(0).toLocaleLowerCase("vi") + name.slice(1);
  }
  if (locale === "en") return name;

  return null;
}

/**
 * Czech says "ve vietnamštině", not "v jazyce vietnamština", and the locative
 * cannot be derived reliably from the noun Intl gives us — the preposition
 * alternates between "v" and "ve" on the consonant cluster that follows. So,
 * like the adverbs above, the forms are listed, and a language that is missing
 * falls back to the phrasing that names it in the nominative.
 */
const CZECH_LANGUAGE_LOCATIVE: Record<string, string> = {
  af: "v afrikánštině",
  am: "v amharštině",
  ar: "v arabštině",
  az: "v ázerbájdžánštině",
  be: "v běloruštině",
  bg: "v bulharštině",
  bn: "v bengálštině",
  bs: "v bosenštině",
  ca: "v katalánštině",
  cs: "v češtině",
  cy: "ve velštině",
  da: "v dánštině",
  de: "v němčině",
  el: "v řečtině",
  en: "v angličtině",
  eo: "v esperantu",
  es: "ve španělštině",
  et: "v estonštině",
  eu: "v baskičtině",
  fa: "v perštině",
  fi: "ve finštině",
  fr: "ve francouzštině",
  ga: "v irštině",
  gl: "v galicijštině",
  gu: "v gudžarátštině",
  he: "v hebrejštině",
  hi: "v hindštině",
  hr: "v chorvatštině",
  hu: "v maďarštině",
  hy: "v arménštině",
  id: "v indonéštině",
  is: "v islandštině",
  it: "v italštině",
  ja: "v japonštině",
  ka: "v gruzínštině",
  kk: "v kazaštině",
  km: "v khmerštině",
  kn: "v kannadštině",
  ko: "v korejštině",
  la: "v latině",
  lo: "v laoštině",
  lt: "v litevštině",
  lv: "v lotyštině",
  mk: "v makedonštině",
  ml: "v malajálamštině",
  mn: "v mongolštině",
  mr: "v maráthštině",
  ms: "v malajštině",
  my: "v barmštině",
  ne: "v nepálštině",
  nl: "v nizozemštině",
  no: "v norštině",
  pa: "v paňdžábštině",
  pl: "v polštině",
  pt: "v portugalštině",
  ro: "v rumunštině",
  ru: "v ruštině",
  si: "v sinhálštině",
  sk: "ve slovenštině",
  sl: "ve slovinštině",
  sq: "v albánštině",
  sr: "v srbštině",
  sv: "ve švédštině",
  sw: "ve svahilštině",
  ta: "v tamilštině",
  te: "v telugštině",
  th: "v thajštině",
  tl: "ve filipínštině",
  tr: "v turečtině",
  uk: "v ukrajinštině",
  ur: "v urdštině",
  uz: "v uzbečtině",
  vi: "ve vietnamštině",
  zh: "v čínštině",
};

/**
 * The language being learned, in the form it takes inside "What would you most
 * like to do …?" — "ve vietnamštině", "in Vietnamese", "bằng tiếng Việt".
 *
 * Always returns something usable: where the declined form is not listed, the
 * fallback names the language in the plain way that locale can always build
 * ("v jazyce vietnamština"), because a greeting with a hole in it is worse than
 * a slightly stiff one.
 */
export function getLanguageInForm(
  targetLanguage: string | null | undefined,
  uiLocale: string | null | undefined,
): string | null {
  if (!targetLanguage) return null;
  const locale = getBaseLanguage(uiLocale || "en");
  const name = plainDisplayName(targetLanguage, locale);

  if (locale === "cs") {
    const declined = CZECH_LANGUAGE_LOCATIVE[getBaseLanguage(targetLanguage)];
    if (declined) return declined;
    return name ? `v jazyce ${name}` : null;
  }
  if (!name) return null;
  if (locale === "en") return `in ${name}`;
  if (locale === "uk") {
    // The instrumental is what "робити англійською" needs; indeclinable names
    // ("гінді") keep the explicit "мовою" instead.
    return name.endsWith("а") ? `${name.slice(0, -1)}ою` : `мовою ${name}`;
  }
  if (locale === "vi") {
    return `bằng ${name.charAt(0).toLocaleLowerCase("vi")}${name.slice(1)}`;
  }
  // A locale we do not ship copy for is reading machine-translated strings
  // anyway; the bare name is the least-bad thing to drop into one.
  return name;
}
