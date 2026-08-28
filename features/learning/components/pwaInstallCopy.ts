import { normalizeLanguageCode } from '@/lib/i18n/languages';

type PWAInstallBenefit = { title: string; description: string };

/**
 * Copy for the "get the app" card.
 *
 * It used to carry a second, much longer set of strings for iOS — a Safari
 * warning, five numbered Share-menu steps, a video caption. All of that went
 * when the App Store build landed: on iOS we now send people to the store
 * rather than teaching them to build a home-screen shortcut by hand.
 *
 * What remains has to work for a store button and for add-to-home-screen alike,
 * so the benefits are phrased about *the app*, not about the home screen.
 */
export type PWAInstallIntroCopy = {
  title: string;
  subtitle: string;
  benefitList: PWAInstallBenefit[];
  playCtaLabel: string;
  appStoreCtaLabel: string;
  /** Heads the home-screen option when a store button already sits above it. */
  homeScreenAlternativeLabel: string;
  homeScreenCtaLabel: string;
  homeScreenCtaHint: string;
  homeScreenCtaHintBold: string;
  desktopHint: string;
  skipInstallLabel: string;
};

const copyByLanguage: Record<string, PWAInstallIntroCopy> = {
  en: {
    title: 'Get Word on your phone',
    subtitle: '',
    benefitList: [
      {
        title: 'Better offline support',
        description: 'Most features work without a stable connection.',
      },
      {
        title: 'Easier access',
        description: 'Launch from your home screen with a single tap.',
      },
      {
        title: 'No browser bar',
        description: 'Opens like a standalone app.',
      },
    ],
    playCtaLabel: 'Get it on Google Play',
    appStoreCtaLabel: 'Download on the App Store',
    homeScreenAlternativeLabel: 'Or, without the store',
    homeScreenCtaLabel: 'Add to home screen',
    homeScreenCtaHint: 'After tapping, confirm ',
    homeScreenCtaHintBold: 'Install',
    desktopHint: 'Open your browser menu and choose "Install app" or "Add to Home screen".',
    skipInstallLabel: 'Continue in the browser',
  },
  cs: {
    title: 'Get Word v mobilu',
    subtitle: '',
    benefitList: [
      {
        title: 'Lepší offline podpora',
        description: 'Většinu funkcí zvládneš i bez stabilního připojení.',
      },
      {
        title: 'Snadnější přístup',
        description: 'Spustíš ji z plochy jedním klepnutím.',
      },
      {
        title: 'Bez lišty prohlížeče',
        description: 'Otevírá se jako samostatná aplikace.',
      },
    ],
    playCtaLabel: 'Stáhnout na Google Play',
    appStoreCtaLabel: 'Stáhnout v App Storu',
    homeScreenAlternativeLabel: 'Nebo bez obchodu',
    homeScreenCtaLabel: 'Přidat na plochu mobilu',
    homeScreenCtaHint: 'Po stisknutí potvrď v dialogu prohlížeče ',
    homeScreenCtaHintBold: 'Instalovat',
    desktopHint: 'Otevři menu prohlížeče a zvol "Přidat na plochu".',
    skipInstallLabel: 'Pokračovat v prohlížeči',
  },
  vi: {
    title: 'Get Word trên điện thoại',
    subtitle: '',
    benefitList: [
      {
        title: 'Hỗ trợ offline tốt hơn',
        description: 'Hầu hết tính năng chạy mà không cần kết nối ổn định.',
      },
      {
        title: 'Truy cập dễ hơn',
        description: 'Mở từ màn hình chính chỉ với một chạm.',
      },
      {
        title: 'Không có thanh trình duyệt',
        description: 'Mở như một ứng dụng độc lập.',
      },
    ],
    playCtaLabel: 'Tải trên Google Play',
    appStoreCtaLabel: 'Tải trên App Store',
    homeScreenAlternativeLabel: 'Hoặc, không qua cửa hàng',
    homeScreenCtaLabel: 'Thêm vào màn hình chính',
    homeScreenCtaHint: 'Sau khi chạm, xác nhận ',
    homeScreenCtaHintBold: 'Cài đặt',
    desktopHint: 'Mở menu trình duyệt và chọn "Cài đặt ứng dụng" hoặc "Thêm vào Màn hình chính".',
    skipInstallLabel: 'Tiếp tục trong trình duyệt',
  },
};

function resolveCopyKey(language: string | null | undefined): string {
  const normalized = normalizeLanguageCode(language ?? 'en');
  if (normalized === 'cs') return 'cs';
  if (normalized === 'vi') return 'vi';
  return 'en';
}

export function getPWAInstallIntroCopy(language: string | null | undefined): PWAInstallIntroCopy {
  return copyByLanguage[resolveCopyKey(language)];
}
