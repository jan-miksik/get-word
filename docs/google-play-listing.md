# Google Play listing — ASO draft

Copy for the Google Play store listing, in English and Czech. Everything here is
a draft to edit before pasting into Play Console.

This is the Play counterpart to [`app-store-listing.md`](app-store-listing.md).
The two are deliberately not identical:

- **Play has no keyword field.** Apple gives you a hidden 100-character keyword
  list; Play indexes the *visible* text instead — app name, short description,
  and full description. Every term you want to rank for has to appear in copy a
  human will read.
- **Play's fields are longer.** Name 30, short description 80, full description
  4000. The short description is the highest-weighted indexed field after the
  name, and it is what shows above the fold, so it has to work as search input
  and as a sales line at the same time.
- **Czech tone.** The app switched from vykání to tykání everywhere except
  Terms and Privacy, so the Czech copy here tykuje, matching the landing page
  ("Slovíčka, která ti zůstanou"). `app-store-listing.md` still vyká and should
  get the same sweep before the next iOS submission.

---

## Field limits

| Field | Limit | Indexed for search | Editable without review |
| --- | --- | --- | --- |
| App name | 30 | Yes, highest weight | Yes |
| Short description | 80 | Yes, high weight | Yes |
| Full description | 4000 | Yes, lower weight | Yes |
| Screenshots / feature graphic | — | No | Yes |

---

## Keyword strategy

The current listing name is just `Get Word`, which spends 8 of 30 characters and
ranks for nothing. The single highest-leverage change in this document is adding
a category term to the name.

### Terms the copy targets

**Primary** (must appear in name or short description): vocabulary / slovíčka,
language learning / učení jazyků.

**Secondary** (must appear in the full description, ideally 2–3 times, always in
a sentence that reads naturally): flashcards / kartičky, spaced repetition /
rozložené opakování, AI, pronunciation / výslovnost, custom word lists / vlastní
seznamy slovíček, memorize / zapamatovat.

**Long tail** (once each, worked into feature sections): learn English, learn
Spanish, learn German, offline, free, photo translation, typing practice.

### What you still have to check

Play does not expose search volume, and I have no access to third-party ASO
data, so treat the list above as *candidates chosen for relevance*, not as
volume-verified keywords. Before publishing, verify in Play Console → Grow →
Store performance → Search terms (once the app has traffic), or in an ASO tool,
that the primary terms are worth ranking for in your target markets. Also check
what the top three competitors for "slovíčka" and "vocabulary" currently use in
their names — the term worth taking is the one they are all leaving on the
table.

Do not stuff. Play demotes listings with unnatural keyword repetition, and the
description below is already at a healthy density.

---

## English

### App name — 30 max

Recommended:

```
Get Word: Vocabulary & AI
```

Alternatives at the same limit:

- `Get Word: Vocabulary Builder` — strongest on the anchor term, no AI signal.
- `Get Word – Learn Vocabulary` — reads most naturally, weakest differentiator.
- `Get Word: Flashcards & AI` — trades the category term for the format term.

The recommendation keeps the brand first (required — the brand is what returning
users search for), adds the category anchor, and takes `AI` because it is the
cheapest high-traffic term still available in this category.

### Short description — 80 max

Recommended:

```
Vocabulary you write yourself. AI help, audio, and reviews timed to memory.
```

Alternatives:

- `Learn the words you need most. Custom vocabulary, AI chat, spaced repetition.`
- `Your own vocabulary lists, with translation, pronunciation and smart review.`

### Full description — 4000 max

```
Get Word is a vocabulary app where you make the study material yourself.

Write down the words and sentences you want to be able to say, and the app prepares the translation and the pronunciation for them. From there, spaced repetition takes over: each word comes back just before you would forget it.

Works for any language pair. Pick the language you already know and the language you want to learn — English, Spanish, German, French, Italian, Czech, Ukrainian, Vietnamese, and the rest.


THREE WAYS TO BUILD A WORD LIST

Write it. Type your own words and phrases one at a time, or paste a whole batch at once. Get Word prepares the translations and the pronunciation audio, so a list is ready to study instead of half-finished. You can also start from a prepared list and change it to fit.

Ask for it. Tell the AI chat about a situation you are heading into — a doctor's appointment, a job interview, a trip next month — and it suggests around ten words and phrases at your level. Keep the ones you want; they go straight into your study. It asks how much of the language you already know, from almost nothing to fluent, and for languages that separate polite and casual speech it asks who you will be talking to, so the suggestions come out in the form you would actually use.

Photograph it. Point the camera at what is around you and Photo Lab labels the objects in the picture in the language you are learning, with translations and audio. This is how you get the words you would never think to look up.


SPACED REPETITION THAT FITS YOUR DAY

Short sessions are enough. Mark what you know and what you don't, and the app plans the next review from that. The better you know a word, the longer the interval grows — minutes, then days, then weeks — until the vocabulary settles into long-term memory. No random drilling and no reviewing what you already know.


PRACTICE THE WAY THAT SUITS YOU

Flashcards you reveal by pressing, or by scratching the answer off. A typing mode that checks your spelling, in one direction or both. Short quizzes between cards. Swipe cards, if you would rather learn with your thumb. Switch any of it on or off in settings.


HEAR HOW IT ACTUALLY SOUNDS

Play the pronunciation for any word or phrase, including the ones you added yourself. Knowing what a word means is only half of it.


MEMORY HOOKS

Words stick better when they connect to an image or an association. Write your own memory hooks for the words that keep slipping away, and they show up when you need them.


SYNC ACROSS DEVICES

Sign in and your lists, progress, and settings follow you between your phone, your tablet, and the web app. Study on the bus, review on the laptop.


OPEN SOURCE

Get Word is built in the open. Read the code, report an issue, or contribute: github.com/jan-miksik/get-word

The learning app is free to use.
```

---

## Czech

### Název aplikace — 30 max

Doporučeno:

```
Get Word: slovíčka a jazyky
```

Alternativy ve stejném limitu:

- `Get Word: slovíčka s AI` — silnější na AI, slabší na kategorii.
- `Get Word: učení slovíček` — nejpřirozenější, nejmíň termínů.
- `Get Word: kartičky a AI` — vyměníš kategorii za formát.

`slovíčka` je v češtině kotva celé kategorie a hledá se výrazně víc než
„slovní zásoba"; `jazyky` chytá obecnější dotazy typu „učení jazyků".

### Krátký popis — 80 max

Doporučeno:

```
Slovíčka, která si napíšeš sám. Překlad, výslovnost i načasované opakování.
```

Alternativy:

- `Uč se slova, která opravdu potřebuješ. Vlastní seznamy, AI a opakování.`
- `Vlastní slovíčka s překladem, výslovností a chytrým opakováním.`

### Úplný popis — 4000 max

```
Get Word je slovíčková aplikace, ve které si studijní materiál děláš sám.

Napíšeš si slova a věty, které chceš umět říct, a aplikace k nim připraví překlad i výslovnost. Dál se o to postará rozložené opakování: každé slovo se vrátí těsně předtím, než bys ho zapomněl.

Funguje pro libovolnou kombinaci jazyků. Vybereš si jazyk, který znáš, a jazyk, který se chceš učit — angličtinu, španělštinu, němčinu, francouzštinu, italštinu, češtinu, ukrajinštinu, vietnamštinu i další.


TŘI ZPŮSOBY, JAK SI POSTAVIT SEZNAM SLOVÍČEK

Napiš si je. Vlastní slova a fráze si přidáš po jednom, nebo vložíš celou dávku najednou. Překlady i zvukovou výslovnost připraví aplikace, takže se seznamem se dá rovnou pracovat. Můžeš taky začít z připraveného seznamu a upravit si ho.

Nech si poradit. Popíšeš AI chatu situaci, která tě čeká — návštěva u lékaře, pracovní pohovor, cesta za měsíc — a on k ní navrhne asi deset slov a frází na tvojí úrovni. Co si necháš, jde rovnou do učení. Zeptá se, kolik už z jazyka umíš, od úplného začátku až po plynulou řeč, a u jazyků, které rozlišují zdvořilostní rovinu, i s kým budeš mluvit. Návrhy pak přijdou v podobě, kterou opravdu použiješ.

Vyfoť si je. Namíříš foťák na to, co máš kolem sebe, a Foto lab ti objekty na fotce pojmenuje v jazyce, který se učíš, včetně překladu a výslovnosti. Takhle se dostaneš ke slovům, která by tě nenapadlo hledat.


ROZLOŽENÉ OPAKOVÁNÍ, KTERÉ SE VEJDE DO DNE

Stačí krátké chvíle. Označíš, co už umíš a co ještě ne, a aplikace podle toho naplánuje další opakování. Čím líp slovo znáš, tím delší je interval — nejdřív minuty, pak dny, pak týdny — až se slovní zásoba přesune do dlouhodobé paměti. Žádné náhodné biflování ani opakování toho, co už dávno umíš.


UČ SE TAK, JAK TI TO SEDÍ

Kartičky, které odkryješ přidržením, nebo seškrábnutím. Psací režim, který ti zkontroluje pravopis, jedním směrem nebo obousměrně. Krátké kvízy mezi kartičkami. Swipe kartičky, když se radši učíš palcem. Cokoli z toho si v nastavení zapneš nebo vypneš.


SLYŠ, JAK TO OPRAVDU ZNÍ

Výslovnost si pustíš ke každému slovu i frázi, včetně těch, které sis přidal sám. Vědět, co slovo znamená, je jen půlka věci.


PAMĚŤOVÉ POMŮCKY

Slova se líp pamatují, když se spojí s představou nebo asociací. K těm, která ti pořád utíkají, si napíšeš vlastní paměťovou pomůcku a objeví se ti přesně ve chvíli, kdy ji potřebuješ.


SYNCHRONIZACE MEZI ZAŘÍZENÍMI

Po přihlášení máš seznamy, pokrok i nastavení na telefonu, tabletu i ve webové aplikaci. Učíš se v autobuse, opakuješ na notebooku.


OPEN SOURCE

Get Word vzniká otevřeně. Můžeš si přečíst kód, nahlásit problém nebo přispět: github.com/jan-miksik/get-word

Učící aplikace je zdarma.
```

---

## Before you paste

- **Package name.** `app.getword`, as registered in Play Console. The
  rate-the-app link in Settings is built from `PLAY_PACKAGE_ID` in
  `lib/store-listing.ts`; the two must not drift apart.
- **Localizations.** Decide which store localizations you want. The app bundles
  English, Czech, Ukrainian and Vietnamese UI; the listing only has EN and CS
  copy here. Uk and Vi listings would need the same treatment, or Play will show
  the default listing to those users.
- **Feature claims.** Every feature named above ships today. Photo Lab is on by
  default; typing mode and swipe cards are opt-in in settings, which is why the
  "practice the way that suits you" section says so explicitly. If anything moves
  behind a beta toggle before release, cut the line rather than shipping a claim
  a reviewer can't reproduce.
- **Screenshots.** The description promises Photo Lab, typing mode, and quizzes;
  the screenshots should show them. See `scripts/generate-google-play-screenshots.ts`.
