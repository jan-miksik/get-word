# App Store Connect listing — draft

Copy for the first iOS submission, in Czech and English. Everything here is a
draft to edit before pasting into App Store Connect. Character limits are the
App Store's; the counts in brackets are for the text as written.

Tone follows the landing page (`lib/i18n/locales/*.ts`): plain, concrete, no
superlatives. The app is for learners at any level, so the copy stays
beginner-friendly without addressing beginners specifically. It says the app is
free today without promising it will always be.

---

## App information

| Field | Value |
| --- | --- |
| Bundle ID | `app.getword` |
| Primary category | Education |
| Secondary category | Reference |
| Primary language | English (U.S.) |
| Localizations | English (U.S.), Czech |
| Copyright | © 2026 Jan Mikšík |
| Support URL | https://getword.app/ (or a dedicated page — see the open question below) |
| Marketing URL | https://getword.app/ |
| Privacy Policy URL | https://getword.app/privacy |
| Price | Free |

---

## English (U.S.)

### Name — 30 max

```
Get Word: Learn Vocabulary
```

### Subtitle — 30 max

```
Words that stay, any language
```

### Promotional text — 170 max (editable without a review)

```
Study a few minutes a day. Get Word brings each word back just before you would forget it — with pronunciation, your own lists, and progress that syncs everywhere.
```

### Keywords — 100 max, comma separated, no spaces

```
vocabulary,flashcards,spaced,repetition,language,words,phrases,pronunciation,memorize,srs,study
```

### Description — 4000 max

```
Get Word helps you remember words and phrases instead of just meeting them once.

Words come back when they are worth seeing again. Mark what you know and what you don't; the app plans the next review from that. The better you know a word, the longer the interval grows, until the vocabulary settles into long-term memory.

Works for any language pair — pick the language you know and the language you want to learn.


SPACED REPETITION THAT FITS YOUR DAY

Short sessions are enough. Each word returns at the moment it is worth revisiting, so there is no random drilling and no reviewing things you already know.


LISTS THAT ARE YOURS

Start from a prepared list or build your own for the pair you need right now. Get Word helps you prepare translations and pronunciation audio, so a new list is ready to study rather than half-finished.


HEAR HOW IT ACTUALLY SOUNDS

Play pronunciation for any word or phrase. Learning what a word means is only half of it.


MEMORY AIDS AND SHORT EXERCISES

Words stick better when they connect to an image or an association. Add your own mnemonics, and meet small exercises between cards during review.


PHOTO LAB

Point at a photo and get the objects in it labelled in the language you are learning, with translations and audio. Useful for the vocabulary you never think to look up.


SYNC ACROSS DEVICES

Sign in and your lists, progress, and settings follow you between iPhone, iPad, and the web app.


OPEN SOURCE

Get Word is built in the open. Read the code, report an issue, or contribute: github.com/jan-miksik/get-word

The learning app is free to use.
```

### What's New — first release

```
First release of Get Word for iPhone and iPad.
```

---

## Czech

### Name — 30 max

```
Get Word: Učení slovíček
```

### Subtitle — 30 max

```
Slova, která zůstanou
```

### Promotional text — 170 max

```
Stačí pár minut denně. Get Word vrátí slovíčko těsně předtím, než byste ho zapomněli — s výslovností, vlastními seznamy a pokrokem, který máte na všech zařízeních.
```

### Keywords — 100 max, comma separated, no spaces

```
slovíčka,kartičky,opakování,jazyky,učení,fráze,výslovnost,angličtina,španělština,paměť,srs
```

### Description — 4000 max

```
Get Word pomáhá slovíčka a fráze si opravdu zapamatovat, ne je jen jednou vidět.

Slova se vracejí ve chvíli, kdy je dobré si je znovu připomenout. Označíte, co už umíte a co ještě ne, a aplikace podle toho naplánuje další opakování. Čím lépe slovo znáte, tím delší je interval — až se slovní zásoba přesune do dlouhodobé paměti.

Funguje pro libovolnou kombinaci jazyků. Vyberete jazyk, který znáte, a jazyk, který se chcete učit.


ROZLOŽENÉ OPAKOVÁNÍ, KTERÉ SE VEJDE DO DNE

Stačí krátké chvíle. Každé slovo se vrátí, když má smysl si ho připomenout — žádné náhodné biflování ani opakování toho, co už dávno umíte.


SEZNAMY, KTERÉ JSOU VAŠE

Můžete začít z připraveného seznamu, nebo si vytvořit vlastní přesně pro kombinaci jazyků, kterou právě potřebujete. Překlady i zvukovou výslovnost vám aplikace pomůže připravit, aby se se seznamem dalo rovnou pracovat.


SLYŠET, JAK TO OPRAVDU ZNÍ

Ke každému slovu i frázi si můžete pustit výslovnost. Vědět, co slovo znamená, je jen polovina věci.


PAMĚŤOVÉ POMŮCKY A KRÁTKÁ CVIČENÍ

Slova se lépe pamatují, když se spojí s představou nebo asociací. Můžete si přidávat vlastní mnemotechniky a mezi kartičkami se během opakování objevují drobná cvičení.


FOTO LAB

Vyfotíte, co máte kolem sebe, a aplikace vám objekty na fotce pojmenuje v jazyce, který se učíte — včetně překladu a výslovnosti. Hodí se přesně na tu slovní zásobu, kterou by vás nenapadlo hledat.


SYNCHRONIZACE MEZI ZAŘÍZENÍMI

Po přihlášení máte seznamy, pokrok i nastavení na iPhonu, iPadu i ve webové aplikaci.


OPEN SOURCE

Get Word vzniká otevřeně. Můžete si přečíst kód, nahlásit problém nebo přispět: github.com/jan-miksik/get-word

Učící aplikace je zdarma.
```

### What's New — first release

```
První verze Get Word pro iPhone a iPad.
```

---

## App Review Information

**Sign-in required:** yes.

**Demo account:** not needed. The app signs in with Sign in with Apple, which
the reviewer can complete with their own Apple ID; an account is created
automatically on first sign-in. If the review team prefers a prepared account,
we can supply one on request.

**Notes to reviewer — draft:**

```
Get Word is a vocabulary learning app using spaced repetition.

Signing in: tap "Continue with Apple" on the first screen. Sign in with Apple is
the only sign-in method in this version, so no demo credentials are required —
an account is created on first sign-in and can be used immediately.

Account deletion: Menu → Settings → Account → Delete account. It permanently
erases the account and its learning data.

Camera and photo library: used only by Photo Lab, an optional feature that
labels the objects in a photo you choose, in the language you are learning. It
is reachable from the camera icon in the top bar. Photos are sent to an AI
provider to produce the labels and are not used for anything else.

User-generated content: word lists can be published and shared between users.
Reporting and per-account blocking are available on any public list.
```

---

## App Privacy — draft answers

Confirm each against `app/privacy` before submitting. Nothing here is used for
tracking, so answer **"Data is not used to track you"** for every type.

| Data type | Collected | Linked to identity | Purpose |
| --- | --- | --- | --- |
| Contact Info → Email Address | Yes | Yes | App Functionality |
| User Content → Photos or Videos | Yes | Yes | App Functionality (Photo Lab) |
| User Content → Other User Content | Yes | Yes | App Functionality (lists, notes, mnemonics) |
| Identifiers → User ID | Yes | Yes | App Functionality |
| Identifiers → Device ID | Yes | Yes | App Functionality |
| Usage Data → Product Interaction | Yes | Yes | Analytics, App Functionality |

Not collected: location, contacts, health, financial info, browsing history,
search history, advertising data, crash/performance diagnostics.

---

## Open questions for you

1. **Support URL.** Apple wants a page where a user can get help. The landing
   page has a `contact@getword.app` link in the footer, which may be enough, but
   a small `/support` page with the mail address and a link to GitHub issues
   reads better to a reviewer.
2. **App name.** "Get Word: Learn Vocabulary" trades brand purity for search
   visibility. Plain "Get Word" is cleaner if you would rather keep it.
3. **Photo Lab in v1.** It is the one feature that pulls camera and photo
   permissions, an AI provider, and user-generated content into the review. It
   is in scope by your decision — worth re-confirming that you want it in the
   first submission rather than the second.
