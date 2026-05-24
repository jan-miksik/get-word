import { normalizeLanguageCode } from '@/lib/i18n/languages';

export type MemoryHookExample = {
  source: string;
  target: string;
  hook: string;
};

export type MemoryHooksIntroCopy = {
  title: string;
  body: string;
  learnMoreInline: string;
  examplesPairLabel: string;
  examples: MemoryHookExample[];
  useHooksLabel: string;
  continueLabel: string;
  onLabel: string;
  offLabel: string;
};

export type MemoryHooksLearnMoreCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  temporary: string;
  kindsLabel: string;
  kinds: Array<{
    label: string;
    title: string;
  }>;
  qualitiesLabel: string;
  qualities: Array<{
    title: string;
    description: string;
  }>;
  fadeLabel: string;
  fade: string[];
  makeOwnLabel: string;
  makeOwn: string;
};

const examplesEnglishVietnameseEn: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'eat',
    hook: 'Sounds a bit like "an" in "an apple".',
  },
];

const examplesEnglishVietnameseCs: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'eat',
    hook: 'Zní trochu jako "an" v "an apple".',
  },
];

const examplesEnglishVietnameseVi: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'eat',
    hook: '"ăn" nghe gần giống "an" trong "an apple".',
  },
];

const examplesCzechVietnameseCs: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'jíst',
    hook: 'Zní trochu jako začátek slova "ano" - Ano, dám si něco k jídlu.',
  },
];

const examplesCzechVietnameseEn: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'jíst',
    hook: 'Sounds a bit like Czech "ano" - "Ano, dám si něco k jídlu."',
  },
];

const examplesCzechVietnameseVi: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'jíst',
    hook: '"ăn" có thể gợi đến "ano" trong tiếng Séc - Ano, dám si něco k jídlu.',
  },
];

const examplesVietnameseCzech: MemoryHookExample[] = [
  {
    source: 'jíst',
    target: 'ăn',
    hook: '"jí" trong "jíš" nghe hơi giống "gì" = cái gì. Co jíš? = Bạn đang ăn gì vậy?',
  },
];

const englishToVietnameseCopyByLanguage: Record<string, MemoryHooksIntroCopy> = {
  en: {
    title: 'Memory hooks help you remember words faster',
    body:
      'They connect a new word with something you already know — using sound, images, or simple associations.',
    learnMoreInline: 'Learn more about memory hooks',
    examplesPairLabel: 'EN → VI',
    examples: examplesEnglishVietnameseEn,
    useHooksLabel: 'Use memory hooks',
    continueLabel: 'Continue',
    onLabel: 'On',
    offLabel: 'Off',
  },
  cs: {
    title: 'Mnemotechniky pomáhají zapamatovat si slova rychleji',
    body:
      'Propojují nové slovo s něčím známým — pomocí zvuku, obrázku nebo jednoduché asociace.',
    learnMoreInline: 'zjistit víc',
    examplesPairLabel: 'EN → VI',
    examples: examplesEnglishVietnameseCs,
    useHooksLabel: 'Používat mnemotechniky',
    continueLabel: 'Pokračovat',
    onLabel: 'Zapnuto',
    offLabel: 'Vypnuto',
  },
  vi: {
    title: 'Mẹo ghi nhớ giúp bạn nhớ từ nhanh hơn',
    body:
      'Chúng kết nối từ mới với điều bạn đã biết — bằng âm thanh, hình ảnh hoặc liên tưởng đơn giản.',
    learnMoreInline: 'Tìm hiểu thêm về mẹo ghi nhớ',
    examplesPairLabel: 'EN → VI',
    examples: examplesEnglishVietnameseVi,
    useHooksLabel: 'Dùng mẹo ghi nhớ',
    continueLabel: 'Tiếp tục',
    onLabel: 'Bật',
    offLabel: 'Tắt',
  },
};

const czechToVietnameseCopyByLanguage: Record<string, MemoryHooksIntroCopy> = {
  en: {
    ...englishToVietnameseCopyByLanguage.en,
    examplesPairLabel: 'CS → VI',
    examples: examplesCzechVietnameseEn,
  },
  cs: {
    ...englishToVietnameseCopyByLanguage.cs,
    examplesPairLabel: 'CS → VI',
    examples: examplesCzechVietnameseCs,
  },
  vi: {
    ...englishToVietnameseCopyByLanguage.vi,
    examplesPairLabel: 'CS → VI',
    examples: examplesCzechVietnameseVi,
  },
};

const vietnameseToCzechCopyByLanguage: Record<string, MemoryHooksIntroCopy> = {
  en: {
    ...englishToVietnameseCopyByLanguage.en,
    examplesPairLabel: 'VI → CS',
    examples: examplesVietnameseCzech,
  },
  cs: {
    ...englishToVietnameseCopyByLanguage.cs,
    examplesPairLabel: 'VI → CS',
    examples: examplesVietnameseCzech,
  },
  vi: {
    ...englishToVietnameseCopyByLanguage.vi,
    examplesPairLabel: 'VI → CS',
    examples: examplesVietnameseCzech,
  },
};

const learnMoreCopyByLanguage: Record<string, MemoryHooksLearnMoreCopy> = {
  en: {
    eyebrow: 'How it works',
    title: 'Memory hooks',
    intro:
      'A memory hook is a tiny mental bridge between a new word and something familiar — a similar sound, an image in your head, or a short scene.',
    temporary:
      'A hook is meant to be temporary. Once the word has settled in memory, you no longer need the hook. With disuse, the hook fades and disappears over time.',
    kindsLabel: 'Kinds of hooks',
    kinds: [
      {
        label: 'Sound',
        title: 'Pinning a new word to a word or sound that sounds similar.',
      },
      {
        label: 'Image',
        title: 'Linking the word to something concrete and easy to picture.',
      },
      {
        label: 'Story',
        title: 'A short scene that connects the new word with its meaning.',
      },
    ],
    qualitiesLabel: 'Good hooks tend to be',
    qualities: [
      {
        title: 'Fast',
        description: 'They make sense at a glance, without complex decoding.',
      },
      {
        title: 'Vivid',
        description:
          'They create an image, sound, feeling, or small scene — not just a dry definition.',
      },
      {
        title: 'Personal',
        description:
          'They build on something familiar: a language, experience, humor, place, person, or your own association.',
      },
      {
        title: 'Imperfect',
        description:
          "They don't have to fit exactly. Close enough to bring the meaning to mind is fine.",
      },
    ],
    fadeLabel: 'When the hook fades',
    fade: [
      'In the first encounters with a word, the hook can help a lot. Once the word appears in more sentences and contexts, the meaning starts surfacing directly — without the detour through the original association.',
      'From that point the hook has done its job. It can stop being used and disappear.',
    ],
    makeOwnLabel: 'Your own hooks',
    makeOwn:
      'The strongest hooks are often the ones a person adapts or creates themselves. Your own associations usually stick best.',
  },
  cs: {
    eyebrow: 'Jak to funguje',
    title: 'Mnemotechnické pomůcky',
    intro:
      'Mnemotechnická pomůcka je malý mentální most mezi novým slovem a něčím známým — podobným zvukem, obrazem v hlavě nebo krátkou scénou.',
    temporary:
      'Mnemotechnika má být jen dočasná. Po tom co se slovo usadí v paměti už není nutné mnemotechniku používat. Nepoužíváním mnemotechnika časem vybledne a zmizí.',
    kindsLabel: 'Druhy mnemotechnik',
    kinds: [
      {
        label: 'Zvuk',
        title: 'Přichycení nového slova ke slovu nebo zvuku, který zní podobně.',
      },
      {
        label: 'Obraz',
        title: 'Spojení slova s konkrétním a snadno představitelným obrazem.',
      },
      {
        label: 'Příběh',
        title: 'Krátká scéna, která propojí nové slovo s jeho významem.',
      },
    ],
    qualitiesLabel: 'Dobré mnemotechniky bývají',
    qualities: [
      {
        title: 'Rychlé',
        description: 'Dávají smysl na první pohled, bez složitého luštění.',
      },
      {
        title: 'Živé',
        description:
          'Vytvářejí obraz, zvuk, pocit nebo malou scénu — ne jen suchou definici.',
      },
      {
        title: 'Osobní',
        description:
          'Navazují na něco známého: jazyk, zkušenost, humor, místo, člověka nebo vlastní asociaci.',
      },
      {
        title: 'Nedokonalé',
        description:
          'Nemusí sedět přesně. Stačí, když jsou dost blízko na to, aby pomohly vybavit význam.',
      },
    ],
    fadeLabel: 'Kdy pomůcka vybledne',
    fade: [
      'Při prvních setkáních se slovem může pomůcka výrazně pomoct. Jakmile se slovo objeví ve více větách a kontextech, význam se začne vybavovat přímo — bez odbočky přes původní asociaci.',
      'Od té chvíle pomůcka splnila svůj účel. Může se přestat používat a zmizet.',
    ],
    makeOwnLabel: 'Vlastní pomůcky',
    makeOwn:
      'Nejsilnější často bývají mnemotechniky, které si člověk upraví nebo vytvoří sám. Vlastní asociace obvykle drží nejlépe.',
  },
  vi: {
    eyebrow: 'Cách hoạt động',
    title: 'Mẹo ghi nhớ',
    intro:
      'Mẹo ghi nhớ là một cây cầu nhỏ trong đầu giữa một từ mới và điều gì đó quen thuộc — một âm thanh tương tự, một hình ảnh trong đầu hoặc một cảnh ngắn.',
    temporary:
      'Mẹo chỉ là tạm thời. Khi từ đã ổn định trong trí nhớ, bạn không còn cần dùng mẹo nữa. Không dùng đến thì mẹo dần phai đi và biến mất.',
    kindsLabel: 'Các kiểu mẹo',
    kinds: [
      {
        label: 'Âm',
        title: 'Gắn từ mới vào một từ hoặc âm thanh nghe gần giống.',
      },
      {
        label: 'Hình',
        title: 'Liên kết từ với điều gì đó cụ thể và dễ hình dung.',
      },
      {
        label: 'Chuyện',
        title: 'Một cảnh ngắn nối từ mới với ý nghĩa của nó.',
      },
    ],
    qualitiesLabel: 'Mẹo tốt thường',
    qualities: [
      {
        title: 'Nhanh',
        description: 'Hiểu ngay trong một thoáng, không cần giải mã phức tạp.',
      },
      {
        title: 'Sống động',
        description:
          'Tạo ra hình ảnh, âm thanh, cảm giác hoặc một cảnh nhỏ — không chỉ là định nghĩa khô khan.',
      },
      {
        title: 'Cá nhân',
        description:
          'Bám vào điều quen thuộc: ngôn ngữ, kinh nghiệm, sự hài hước, nơi chốn, con người hay liên tưởng riêng.',
      },
      {
        title: 'Không hoàn hảo',
        description:
          'Không cần khớp chính xác. Đủ gần để gợi ra ý nghĩa là được.',
      },
    ],
    fadeLabel: 'Khi mẹo phai đi',
    fade: [
      'Trong những lần gặp đầu tiên, mẹo có thể giúp rất nhiều. Khi từ xuất hiện trong nhiều câu và bối cảnh khác nhau, ý nghĩa bắt đầu hiện ra trực tiếp — không cần đi vòng qua liên tưởng ban đầu.',
      'Từ lúc đó mẹo đã hoàn thành vai trò. Có thể ngừng dùng và tự biến mất.',
    ],
    makeOwnLabel: 'Mẹo của riêng bạn',
    makeOwn:
      'Những mẹo mạnh nhất thường là những mẹo do chính bạn tự điều chỉnh hoặc tạo ra. Liên tưởng riêng của bạn thường bám lâu nhất.',
  },
};

function resolveCopyKey(language: string | null | undefined): string {
  const normalized = normalizeLanguageCode(language ?? 'en');
  if (normalized === 'cs') return 'cs';
  if (normalized === 'vi') return 'vi';
  return 'en';
}

export function getMemoryHooksIntroCopy(
  language: string | null | undefined,
  learningLanguageFrom?: string | null,
  learningLanguageTo?: string | null,
): MemoryHooksIntroCopy {
  const uiKey = resolveCopyKey(language);
  const from = normalizeLanguageCode(learningLanguageFrom ?? '');
  const to = normalizeLanguageCode(learningLanguageTo ?? '');
  let copyByLanguage = englishToVietnameseCopyByLanguage;
  if (uiKey === 'vi' || (from === 'vi' && to === 'cs')) {
    copyByLanguage = vietnameseToCzechCopyByLanguage;
  } else if (from === 'cs' && to === 'vi') {
    copyByLanguage = czechToVietnameseCopyByLanguage;
  }
  return copyByLanguage[uiKey];
}

export function getMemoryHooksLearnMoreCopy(
  language: string | null | undefined,
): MemoryHooksLearnMoreCopy {
  return learnMoreCopyByLanguage[resolveCopyKey(language)];
}
