import { PUBLIC_LANGUAGE_STORAGE_KEY } from '@/lib/i18n/public-language';

/* ------------------------------------------------------------------ *
 * Landing-page translations
 *
 * Self-contained copy dictionary for the public marketing page so it can
 * greet visitors in their own language. The default is English; on the
 * client the page picks the best match for `navigator.language` (and
 * remembers a manual choice in localStorage).
 * ------------------------------------------------------------------ */

export type LandingLang = 'en' | 'uk' | 'vi' | 'cs';

export const LANDING_LANG_STORAGE_KEY = PUBLIC_LANGUAGE_STORAGE_KEY;

export const LANDING_LANGS: { code: LandingLang; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'cs', label: 'Čeština', flag: '🇨🇿' },
];

export interface LandingContent {
  /** BCP-47 tag for the <html lang> hint while this language is shown. */
  htmlLang: string;
  hero: {
    title: string;
    subtitle: string;
    /** Unified auth CTA — the /login route handles both sign-in and sign-up. */
    getStarted: string;
  };
  features: {
    kicker: string;
    title: string;
    /** Six feature bodies, in the same order as the FEATURES list. */
    items: { title: string; body: string }[];
  };
  how: {
    kicker: string;
    title: string;
    steps: { title: string; body: string }[];
  };
  openSource: { title: string; body: string; cta: string };
  cta: { title: string; body: string; button: string };
  footer: {
    github: string;
    contact: string;
    privacy: string;
    terms: string;
  };
  /** aria-label for the language switcher. */
  languagePicker: string;
}

const en: LandingContent = {
  htmlLang: 'en',
  hero: {
    title: 'Words that stay',
    subtitle:
      'Get Word helps you memorize words and phrases with spaced repetition, audio pronunciation, and curated lists or your own custom lists. For any language pair.',
    getStarted: 'Get started',
  },
  features: {
    kicker: 'What you get',
    title: 'Study less randomly, review when it matters',
    items: [
      {
        title: 'Spaced repetition',
        body: 'Words come back right before you would forget them, so review time lands where it actually counts.',
      },
      {
        title: 'Your own lists',
        body: 'Build lists for any language pair. Translations and example phrases are generated for you, ready to study in minutes.',
      },
      {
        title: 'Pronunciation audio',
        body: 'Hear every word and phrase with clear pronunciation audio. Learn how the language actually sounds.',
      },
      {
        title: 'Memory hooks & games',
        body: 'Lock vocabulary in with personal memory hooks and quick minigames woven right into your study stream.',
      },
      {
        title: 'Syncs everywhere',
        body: 'Sign in once. Your lists, progress, and preferences follow you across phone, tablet, and desktop.',
      },
      {
        title: 'Install as an app',
        body: 'Add Get Word to your home screen and study full-screen, offline-friendly — no app store required.',
      },
    ],
  },
  how: {
    kicker: 'How it works',
    title: 'Three steps to your first words',
    steps: [
      {
        title: 'Pick your pair',
        body: 'Choose what you speak and what you want to learn, then start from a ready-made list or your own.',
      },
      {
        title: 'Study daily',
        body: 'Flip cards, hear pronunciations, mark what you know. Get Word schedules the rest for you.',
      },
      {
        title: 'Remember for good',
        body: 'Words resurface at just the right moment, moving steadily into your long-term memory.',
      },
    ],
  },
  openSource: {
    title: 'Open source',
    body: 'Get Word is built as open-source app. Read the code, file an issue, or contribute — it’s all on GitHub.',
    cta: 'Star on GitHub',
  },
  cta: {
    title: 'Ready to start remembering?',
    body: 'Pick a language pair and study your first words in minutes. No app store required.',
    button: 'Start learning',
  },
  footer: {
    github: 'GitHub',
    contact: 'Contact',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  languagePicker: 'Choose language',
};

const uk: LandingContent = {
  htmlLang: 'uk',
  hero: {
    title: 'Слова, що залишаються',
    subtitle:
      'Get Word допомагає запам’ятовувати слова та фрази за допомогою інтервального повторення, аудіовимови та готових або власних списків. Для будь-якої пари мов.',
    getStarted: 'Почати',
  },
  features: {
    kicker: 'Що ви отримаєте',
    title: 'Менше хаотичного навчання — повторюйте тоді, коли це важливо',
    items: [
      {
        title: 'Інтервальне повторення',
        body: 'Слова повертаються саме перед тим, як ви б їх забули, тож час на повторення витрачається там, де це справді має значення.',
      },
      {
        title: 'Власні списки',
        body: 'Створюйте списки для будь-якої пари мов. Переклади та приклади фраз генеруються автоматично — готові до навчання за лічені хвилини.',
      },
      {
        title: 'Аудіовимова',
        body: 'Слухайте кожне слово та фразу з чіткою аудіовимовою. Дізнайтеся, як мова звучить насправді.',
      },
      {
        title: 'Мнемонічні підказки та ігри',
        body: 'Закріплюйте лексику персональними мнемонічними підказками та швидкими міні-іграми, вплетеними прямо у ваш потік навчання.',
      },
      {
        title: 'Синхронізація всюди',
        body: 'Увійдіть один раз. Ваші списки, прогрес і налаштування йдуть за вами на телефоні, планшеті та комп’ютері.',
      },
      {
        title: 'Встановлюється як застосунок',
        body: 'Додайте Get Word на головний екран і навчайтеся на весь екран, навіть офлайн — без жодного app store.',
      },
    ],
  },
  how: {
    kicker: 'Як це працює',
    title: 'Три кроки до ваших перших слів',
    steps: [
      {
        title: 'Оберіть пару мов',
        body: 'Виберіть, якою мовою розмовляєте та яку хочете вивчати, а потім почніть із готового або власного списку.',
      },
      {
        title: 'Навчайтеся щодня',
        body: 'Гортайте картки, слухайте вимову, позначайте те, що знаєте. Решту Get Word спланує за вас.',
      },
      {
        title: 'Запам’ятайте назавжди',
        body: 'Слова з’являються знову саме в потрібний момент, поступово переходячи у вашу довготривалу пам’ять.',
      },
    ],
  },
  openSource: {
    title: 'З відкритим кодом',
    body: 'Get Word створено як застосунок з відкритим кодом. Читайте код, повідомляйте про проблеми або робіть внесок — усе це на GitHub.',
    cta: 'Зірка на GitHub',
  },
  cta: {
    title: 'Готові почати запам’ятовувати?',
    body: 'Оберіть пару мов і вивчіть перші слова за лічені хвилини. Без app store.',
    button: 'Почати навчання',
  },
  footer: {
    github: 'GitHub',
    contact: 'Контакти',
    privacy: 'Конфіденційність',
    terms: 'Умови',
  },
  languagePicker: 'Обрати мову',
};

const vi: LandingContent = {
  htmlLang: 'vi',
  hero: {
    title: 'Những từ ở lại với bạn',
    subtitle:
      'Get Word giúp bạn ghi nhớ từ và cụm từ bằng phương pháp lặp lại ngắt quãng, phát âm bằng âm thanh, cùng các danh sách có sẵn hoặc tự tạo. Cho mọi cặp ngôn ngữ.',
    getStarted: 'Bắt đầu',
  },
  features: {
    kicker: 'Những gì bạn nhận được',
    title: 'Học ít ngẫu nhiên hơn, ôn tập khi thật sự cần',
    items: [
      {
        title: 'Lặp lại ngắt quãng',
        body: 'Từ vựng quay lại ngay trước khi bạn sắp quên, nên thời gian ôn tập rơi đúng vào lúc quan trọng nhất.',
      },
      {
        title: 'Danh sách của riêng bạn',
        body: 'Tạo danh sách cho mọi cặp ngôn ngữ. Bản dịch và câu ví dụ được tạo sẵn cho bạn, sẵn sàng để học chỉ trong vài phút.',
      },
      {
        title: 'Âm thanh phát âm',
        body: 'Nghe từng từ và cụm từ với âm thanh phát âm rõ ràng. Học cách ngôn ngữ thật sự vang lên.',
      },
      {
        title: 'Mẹo ghi nhớ & trò chơi',
        body: 'Khắc sâu từ vựng bằng mẹo ghi nhớ cá nhân và các trò chơi nhỏ nhanh gọn đan xen ngay trong dòng học của bạn.',
      },
      {
        title: 'Đồng bộ mọi nơi',
        body: 'Đăng nhập một lần. Danh sách, tiến độ và tùy chọn của bạn theo bạn trên điện thoại, máy tính bảng và máy tính.',
      },
      {
        title: 'Cài như một ứng dụng',
        body: 'Thêm Get Word vào màn hình chính và học toàn màn hình, thân thiện ngoại tuyến — không cần kho ứng dụng.',
      },
    ],
  },
  how: {
    kicker: 'Cách hoạt động',
    title: 'Ba bước đến những từ đầu tiên của bạn',
    steps: [
      {
        title: 'Chọn cặp ngôn ngữ',
        body: 'Chọn ngôn ngữ bạn nói và ngôn ngữ bạn muốn học, rồi bắt đầu từ danh sách có sẵn hoặc của riêng bạn.',
      },
      {
        title: 'Học mỗi ngày',
        body: 'Lật thẻ, nghe phát âm, đánh dấu những gì bạn đã biết. Get Word sắp xếp phần còn lại cho bạn.',
      },
      {
        title: 'Ghi nhớ lâu dài',
        body: 'Từ vựng xuất hiện lại đúng thời điểm, dần dần đi vào trí nhớ dài hạn của bạn.',
      },
    ],
  },
  openSource: {
    title: 'Mã nguồn mở',
    body: 'Get Word được xây dựng như một ứng dụng mã nguồn mở. Đọc mã, báo lỗi hoặc đóng góp — tất cả đều có trên GitHub.',
    cta: 'Gắn sao trên GitHub',
  },
  cta: {
    title: 'Sẵn sàng để bắt đầu ghi nhớ?',
    body: 'Chọn một cặp ngôn ngữ và học những từ đầu tiên chỉ trong vài phút. Không cần kho ứng dụng.',
    button: 'Bắt đầu học',
  },
  footer: {
    github: 'GitHub',
    contact: 'Liên hệ',
    privacy: 'Quyền riêng tư',
    terms: 'Điều khoản',
  },
  languagePicker: 'Chọn ngôn ngữ',
};

const cs: LandingContent = {
  htmlLang: 'cs',
  hero: {
    title: 'Slova, která zůstanou',
    subtitle:
      'Get Word vám pomáhá zapamatovat si slova a fráze pomocí rozloženého opakování, zvukové výslovnosti a připravených nebo vlastních seznamů. Pro libovolnou jazykovou dvojici.',
    getStarted: 'Začít',
  },
  features: {
    kicker: 'Co získáte',
    title: 'Méně náhodného učení, opakování ve správnou chvíli',
    items: [
      {
        title: 'Rozložené opakování',
        body: 'Slova se vrátí těsně předtím, než byste je zapomněli, takže čas na opakování padne přesně tam, kde se to opravdu počítá.',
      },
      {
        title: 'Vlastní seznamy',
        body: 'Vytvářejte seznamy pro libovolnou jazykovou dvojici. Překlady a ukázkové fráze se vygenerují za vás — připravené ke studiu během několika minut.',
      },
      {
        title: 'Zvuková výslovnost',
        body: 'Slyšte každé slovo a frázi s jasnou zvukovou výslovností. Naučte se, jak jazyk doopravdy zní.',
      },
      {
        title: 'Paměťové háčky a hry',
        body: 'Upevněte si slovní zásobu pomocí osobních paměťových háčků a rychlých miniher vetkaných přímo do vašeho studijního proudu.',
      },
      {
        title: 'Synchronizace všude',
        body: 'Přihlaste se jednou. Vaše seznamy, pokrok a předvolby vás provázejí na telefonu, tabletu i počítači.',
      },
      {
        title: 'Nainstalujte jako aplikaci',
        body: 'Přidejte Get Word na plochu a studujte na celou obrazovku, i offline — bez nutnosti obchodu s aplikacemi.',
      },
    ],
  },
  how: {
    kicker: 'Jak to funguje',
    title: 'Tři kroky k vašim prvním slovům',
    steps: [
      {
        title: 'Vyberte si dvojici',
        body: 'Zvolte, jakým jazykem mluvíte a který se chcete učit, a začněte s hotovým nebo vlastním seznamem.',
      },
      {
        title: 'Studujte každý den',
        body: 'Otáčejte kartičky, poslouchejte výslovnost, označujte, co znáte. Zbytek za vás naplánuje Get Word.',
      },
      {
        title: 'Zapamatujte si natrvalo',
        body: 'Slova se znovu objeví v ten správný okamžik a postupně přecházejí do vaší dlouhodobé paměti.',
      },
    ],
  },
  openSource: {
    title: 'Open source',
    body: 'Get Word je vytvořen jako open-source aplikace. Přečtěte si kód, nahlaste problém nebo přispějte — vše najdete na GitHubu.',
    cta: 'Dejte hvězdu na GitHubu',
  },
  cta: {
    title: 'Připraveni začít si pamatovat?',
    body: 'Vyberte jazykovou dvojici a naučte se první slova během několika minut. Bez obchodu s aplikacemi.',
    button: 'Začít se učit',
  },
  footer: {
    github: 'GitHub',
    contact: 'Kontakt',
    privacy: 'Soukromí',
    terms: 'Podmínky',
  },
  languagePicker: 'Vyberte jazyk',
};

export const LANDING_CONTENT: Record<LandingLang, LandingContent> = {
  en,
  uk,
  vi,
  cs,
};

export const DEFAULT_LANDING_LANG: LandingLang = 'en';

const SUPPORTED: LandingLang[] = ['en', 'uk', 'vi', 'cs'];

/** Map an arbitrary BCP-47 tag (e.g. "cs-CZ", "uk") to a supported language. */
export function resolveLandingLang(tag: string | undefined | null): LandingLang | null {
  if (!tag) return null;
  const primary = tag.toLowerCase().split('-')[0];
  return (SUPPORTED as string[]).includes(primary) ? (primary as LandingLang) : null;
}

/** Best supported match for the browser's preferred languages, or the default. */
export function detectBrowserLang(): LandingLang {
  if (typeof navigator === 'undefined') return DEFAULT_LANDING_LANG;
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of candidates) {
    const match = resolveLandingLang(tag);
    if (match) return match;
  }
  return DEFAULT_LANDING_LANG;
}
