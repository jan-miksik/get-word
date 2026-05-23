import { normalizeLanguageCode } from '@/lib/i18n/languages';

export type MemoryHooksIntroCopy = {
  title: string;
  body: string;
  exampleLines: string[];
  note: string;
  keepOnLabel: string;
  turnOffLabel: string;
  learnMoreLabel: string;
};

export type MemoryHooksLearnMoreCopy = {
  title: string;
  paragraphs: string[];
  bulletItems: string[];
  example: string;
  temporary: string;
  outro: string;
};

const introCopyByLanguage: Record<string, MemoryHooksIntroCopy> = {
  en: {
    title: 'Memory hooks help you remember words faster',
    body:
      'They connect a new word with something you already know - using sound, images, or simple associations.',
    exampleLines: [
      'Example: "ăn" = eat',
      'Sounds a bit like "an" in "an apple".',
    ],
    note:
      'This is just an example from English -> Vietnamese. You can edit hooks later so they fit your own language and memory better.',
    keepOnLabel: 'Keep on',
    turnOffLabel: 'Turn off',
    learnMoreLabel: 'Learn more',
  },
  cs: {
    title: 'Paměťové háčky (mnemotechniky) pomáhají zapamatovat si slova rychleji',
    body:
      'Propojují nové slovo s něčím, co už je známé - podle zvuku, obrázku nebo jednoduché asociace.',
    exampleLines: [
      'Příklad: "ăn" = jíst',
      'Zní trochu jako začátek slova "ano".',
      'Pomůcka: "Ano, dám si něco k jídlu."',
    ],
    note:
      'Toto je zatím jednoduchý příklad. Pomůcky si později můžete upravit tak, aby lépe fungovaly pro vaši paměť a jazyk.',
    keepOnLabel: 'Nechat zapnuté',
    turnOffLabel: 'Vypnout',
    learnMoreLabel: 'Zjistit víc',
  },
  vi: {
    title: 'Mẹo ghi nhớ giúp bạn nhớ từ nhanh hơn',
    body:
      'Chúng kết nối từ mới với điều bạn đã biết - bằng âm thanh, hình ảnh hoặc liên tưởng đơn giản.',
    exampleLines: [
      'Ví dụ: "ăn" = eat',
      'Nghe hơi giống "an" trong "an apple".',
    ],
    note:
      'Đây chỉ là ví dụ tiếng Anh -> tiếng Việt. Sau này bạn có thể chỉnh mẹo ghi nhớ để phù hợp hơn với ngôn ngữ và trí nhớ của mình.',
    keepOnLabel: 'Giữ bật',
    turnOffLabel: 'Tắt',
    learnMoreLabel: 'Tìm hiểu thêm',
  },
};

const learnMoreCopyByLanguage: Record<string, MemoryHooksLearnMoreCopy> = {
  en: {
    title: 'Memory hooks',
    paragraphs: [
      'Memory hooks are small tricks that help you remember new words.',
      'They connect a new word with something familiar - a sound, image, story, feeling, or personal memory.',
      'Good hooks are usually:',
    ],
    bulletItems: [
      'Fast - you understand them immediately.',
      'Visual - they create a picture in your mind.',
      'Personal - they connect to something you already know.',
      'Imperfect - they do not need to be exact.',
    ],
    example: 'Example: "ăn" means "eat". You might remember it through "an apple" -> eating an apple.',
    temporary: 'The hook is only temporary. Once the word feels familiar, you do not need the hook anymore.',
    outro: 'The best hooks are often the ones you edit or create yourself.',
  },
  cs: {
    title: 'Paměťové háčky',
    paragraphs: [
      'Paměťové háčky jsou krátké triky, které pomáhají zapamatovat si nová slova.',
      'Propojí nové slovo s něčím známým - zvukem, obrázkem, příběhem, pocitem nebo osobní vzpomínkou.',
      'Dobrá pomůcka bývá:',
    ],
    bulletItems: [
      'rychlá - je pochopená hned,',
      'obrazová - vytvoří v hlavě obrázek,',
      'osobní - naváže se na něco, co už je známé,',
      'nedokonalá - nemusí sedět přesně.',
    ],
    example: 'Příklad: "ăn" znamená "jíst". Může se spojit s větou: "Ano, dám si něco k jídlu."',
    temporary: 'Pomůcka je jen dočasná. Jakmile je slovo zapamatované, už ji není potřeba.',
    outro: 'Nejlepší pomůcky často vzniknou tak, že si je upravíte nebo vytvoříte sami.',
  },
  vi: {
    title: 'Mẹo ghi nhớ',
    paragraphs: [
      'Mẹo ghi nhớ là những mẹo nhỏ giúp bạn nhớ từ mới dễ hơn.',
      'Chúng kết nối từ mới với điều quen thuộc - âm thanh, hình ảnh, câu chuyện, cảm xúc hoặc ký ức cá nhân.',
      'Một mẹo ghi nhớ tốt thường là:',
    ],
    bulletItems: [
      'nhanh - bạn hiểu ngay,',
      'có hình ảnh - tạo ra hình ảnh trong đầu,',
      'cá nhân - liên quan đến điều bạn đã biết,',
      'không cần hoàn hảo - không cần chính xác tuyệt đối.',
    ],
    example: 'Ví dụ: "ăn" nghĩa là "eat". Bạn có thể nhớ qua cụm "an apple" -> đang ăn một quả táo.',
    temporary: 'Mẹo ghi nhớ chỉ là tạm thời. Khi từ đã quen thuộc, bạn không cần mẹo đó nữa.',
    outro: 'Những mẹo tốt nhất thường là mẹo bạn tự chỉnh sửa hoặc tự tạo ra.',
  },
};

function resolveCopyKey(language: string | null | undefined): string {
  const normalized = normalizeLanguageCode(language ?? 'en');
  if (normalized === 'cs') return 'cs';
  if (normalized === 'vi') return 'vi';
  return 'en';
}

export function getMemoryHooksIntroCopy(language: string | null | undefined): MemoryHooksIntroCopy {
  return introCopyByLanguage[resolveCopyKey(language)];
}

export function getMemoryHooksLearnMoreCopy(
  language: string | null | undefined,
): MemoryHooksLearnMoreCopy {
  return learnMoreCopyByLanguage[resolveCopyKey(language)];
}
