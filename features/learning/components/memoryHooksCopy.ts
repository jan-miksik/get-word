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
    example: string;
  }>;
  qualitiesLabel: string;
  qualities: Array<{
    title: string;
    description: string;
  }>;
  fadeLabel: string;
  fade: string;
  makeOwnLabel: string;
  makeOwn: string;
};

const examplesEn: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'eat',
    hook: 'Sounds like "an" in "an apple" - imagine eating an apple.',
  },
];

const examplesCs: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'jíst',
    hook: 'Zní trochu jako začátek slova "ano" - Ano, dám si něco k jídlu.',
  },
];

const examplesEnglishVietnameseCs: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'eat',
    hook: 'V angličtině zní jako "an" v "an apple" - představ si, že jíš jablko.',
  },
];

const examplesCzechVietnameseEn: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'jíst',
    hook: 'Sounds a bit like Czech "ano" - "Ano, dám si něco k jídlu."',
  },
];

const examplesVi: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'eat',
    hook: '"ăn" nghe gần giống "an" trong "an apple" - tưởng tượng đang ăn táo.',
  },
];

const examplesCzechVietnameseVi: MemoryHookExample[] = [
  {
    source: 'ăn',
    target: 'jíst',
    hook: '"ăn" có thể gợi đến "ano" trong tiếng Séc - Ano, dám si něco k jídlu.',
  },
];

const introCopyByLanguage: Record<string, MemoryHooksIntroCopy> = {
  en: {
    title: 'Memory hooks help you remember words faster',
    body:
      'They connect a new word with something you already know — using sound, images, or simple associations.',
    learnMoreInline: 'Learn more about memory hooks',
    examplesPairLabel: 'EN → VI',
    examples: examplesEn,
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
    examples: examplesVi,
    useHooksLabel: 'Dùng mẹo ghi nhớ',
    continueLabel: 'Tiếp tục',
    onLabel: 'Bật',
    offLabel: 'Tắt',
  },
};

const englishToVietnameseCopyByLanguage = introCopyByLanguage;
const czechToVietnameseCopyByLanguage: Record<string, MemoryHooksIntroCopy> = {
  en: {
    ...introCopyByLanguage.en,
    examplesPairLabel: 'CS → VI',
    examples: examplesCzechVietnameseEn,
  },
  cs: {
    ...introCopyByLanguage.cs,
    examplesPairLabel: 'CS → VI',
    examples: examplesCs,
  },
  vi: {
    ...introCopyByLanguage.vi,
    examplesPairLabel: 'CS → VI',
    examples: examplesCzechVietnameseVi,
  },
};

const learnMoreCopyByLanguage: Record<string, MemoryHooksLearnMoreCopy> = {
  en: {
    eyebrow: 'How it works',
    title: 'Memory hooks',
    intro:
      "A memory hook is a tiny mental bridge from a new word to something you already know - a sound it rhymes with, a picture it conjures, or a quick story you'd tell about it.",
    temporary:
      'Once the word feels familiar on its own, the hook quietly falls away. You stop using it without thinking about it.',
    kindsLabel: 'Three kinds of hooks',
    kinds: [
      {
        label: 'Sound',
        title: 'Pin a Vietnamese word to one that rhymes or echoes in English.',
        example: '"mèo" sounds like "meow" - the noise a cat makes.',
      },
      {
        label: 'Image',
        title: 'Picture something specific and vivid in your head.',
        example: '"ba" = three -> three sheep saying "baa".',
      },
      {
        label: 'Story',
        title: 'Build a tiny scene that links the word to its meaning.',
        example: '"ăn" = eat -> you, biting into "an apple".',
      },
    ],
    qualitiesLabel: 'Good hooks are usually',
    qualities: [
      {
        title: 'Fast',
        description: 'Understood in a glance - no effort to decode.',
      },
      {
        title: 'Vivid',
        description: 'Picture, sound, or feeling, not just a definition.',
      },
      {
        title: 'Personal',
        description: 'Hangs off something you already know.',
      },
      {
        title: 'Imperfect',
        description: "Doesn't have to be exact - close enough is fine.",
      },
    ],
    fadeLabel: 'When the hook fades',
    fade:
      'The first few times you meet a word, the hook is doing the heavy lifting. As you see the word in different sentences, the word starts pulling its own meaning straight up - no detour through "an apple" needed. From then on we quietly drop the hook from the card.',
    makeOwnLabel: 'Make your own',
    makeOwn:
      'Hooks we suggest are a starting point. The strongest hooks are the ones you write yourself - your own associations stick best. Tap Edit hook on any card to swap in your own.',
  },
  cs: {
    eyebrow: 'Jak to funguje',
    title: 'Mnemotechniky',
    intro:
      'Mnemotechnická pomůcka je malý mentální most mezi novým slovem a něčím známým - podobným zvukem, obrázkem v hlavě nebo krátkou scénou.',
    temporary:
      'Jakmile slovo začne působit známě samo o sobě, háček tiše zmizí. Přestaneš ho používat, aniž bys na to musel myslet.',
    kindsLabel: 'Tři druhy mnemotechnik',
    kinds: [
      {
        label: 'Zvuk',
        title: 'Přichyť vietnamské slovo ke slovu, které zní podobně.',
        example: '"mèo" zní jako anglické "meow" - zvuk, který dělá kočka.',
      },
      {
        label: 'Obraz',
        title: 'Představ si něco konkrétního a živého.',
        example: '"ba" = three -> tři ovce říkají "baa".',
      },
      {
        label: 'Příběh',
        title: 'Postav malou scénu, která spojí slovo s významem.',
        example: '"ăn" = jíst -> "ano, dám si něco k jídlu".',
      },
    ],
    qualitiesLabel: 'Dobré mnemotechniky bývají',
    qualities: [
      {
        title: 'Rychlé',
        description: 'Pochopíš je na první pohled - bez luštění.',
      },
      {
        title: 'Živé',
        description: 'Obrázek, zvuk nebo pocit, ne jen definice.',
      },
      {
        title: 'Osobní',
        description: 'Navazují na něco, co už znáš.',
      },
      {
        title: 'Nedokonalé',
        description: 'Nemusí sedět přesně - stačí dost blízko.',
      },
    ],
    fadeLabel: 'Kdy pomůcka vybledne',
    fade:
      'Prvních pár setkání se slovem pomůcka hodně pomáhá. Jakmile slovo uvidíš v různých větách, začne si význam vytahovat samo - bez odbočky přes "ano". Od té chvíle pomůcka z kartičky potichu zmizí.',
    makeOwnLabel: 'Vytvoř si vlastní',
    makeOwn:
      'Navržené mnemotechniky jsou jen začátek. Nejsilnější bývají ty, které si upravíš nebo napíšeš sám - vlastní asociace drží nejlíp. Na kartičce můžeš klepnout na Upravit pomůcku a vyměnit ji za svou.',
  },
  vi: {
    eyebrow: 'Cách hoạt động',
    title: 'Mẹo ghi nhớ',
    intro:
      'Mẹo ghi nhớ là một cây cầu nhỏ trong đầu, nối từ mới với điều bạn đã biết - âm thanh gần giống, hình ảnh gợi ra, hoặc một câu chuyện rất ngắn.',
    temporary:
      'Khi từ đã trở nên quen thuộc, mẹo sẽ tự mờ đi. Bạn ngừng dùng nó mà gần như không cần nghĩ.',
    kindsLabel: 'Ba kiểu mẹo',
    kinds: [
      {
        label: 'Âm',
        title: 'Nối một từ tiếng Việt với âm gần giống trong tiếng Anh.',
        example: '"mèo" nghe như "meow" - tiếng kêu của con mèo.',
      },
      {
        label: 'Hình',
        title: 'Tưởng tượng một hình ảnh thật cụ thể và rõ.',
        example: '"ba" = three -> ba con cừu kêu "baa".',
      },
      {
        label: 'Chuyện',
        title: 'Tạo một cảnh nhỏ nối từ với nghĩa của nó.',
        example: '"ăn" = eat -> bạn đang cắn vào "an apple".',
      },
    ],
    qualitiesLabel: 'Mẹo tốt thường',
    qualities: [
      {
        title: 'Nhanh',
        description: 'Hiểu ngay trong một thoáng - không cần giải mã.',
      },
      {
        title: 'Sống động',
        description: 'Có hình, âm thanh, hoặc cảm giác, không chỉ là định nghĩa.',
      },
      {
        title: 'Cá nhân',
        description: 'Bám vào điều bạn đã biết.',
      },
      {
        title: 'Không hoàn hảo',
        description: 'Không cần chính xác tuyệt đối - gần đủ là được.',
      },
    ],
    fadeLabel: 'Khi mẹo mờ đi',
    fade:
      'Trong vài lần đầu gặp một từ, mẹo đang giúp rất nhiều. Khi bạn thấy từ đó trong nhiều câu khác nhau, chính từ ấy bắt đầu kéo nghĩa lên trực tiếp - không cần đi vòng qua "an apple" nữa. Từ lúc đó, chúng tôi sẽ nhẹ nhàng bỏ mẹo khỏi thẻ.',
    makeOwnLabel: 'Tự tạo mẹo',
    makeOwn:
      'Mẹo được gợi ý chỉ là điểm bắt đầu. Mẹo mạnh nhất thường là mẹo bạn tự viết - liên tưởng riêng của bạn sẽ bám lâu hơn. Chạm Edit hook trên bất kỳ thẻ nào để thay bằng mẹo của bạn.',
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
  const from = normalizeLanguageCode(learningLanguageFrom ?? '');
  const to = normalizeLanguageCode(learningLanguageTo ?? '');
  const copyByLanguage =
    from === 'cs' && to === 'vi'
      ? czechToVietnameseCopyByLanguage
      : englishToVietnameseCopyByLanguage;
  return copyByLanguage[resolveCopyKey(language)];
}

export function getMemoryHooksLearnMoreCopy(
  language: string | null | undefined,
): MemoryHooksLearnMoreCopy {
  return learnMoreCopyByLanguage[resolveCopyKey(language)];
}
