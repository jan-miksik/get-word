import { normalizeLanguageCode } from '@/lib/i18n/languages';

export type PWAInstallBenefit = { title: string; description: string };

export type PWAInstallIntroCopy = {
  iosTitle: string;
  iosSubtitle: string;
  androidTitle: string;
  androidSubtitle: string;
  benefitChips: PWAInstallBenefit[];
  benefitList: PWAInstallBenefit[];
  safariBannerLabel: string;
  safariBannerHeadline: string;
  safariBannerBodyBefore: string;
  safariBannerMenuLabel: string;
  safariBannerBodyAfter: string;
  iosStepsLabel: string;
  iosStepsBadge: string;
  iosSteps: { text: string; bold: string; alt?: string }[];
  videoLabel: string;
  androidCtaLabel: string;
  androidCtaHint: string;
  androidCtaHintBold: string;
  desktopHint: string;
  skipInstallLabel: string;
};

const copyByLanguage: Record<string, PWAInstallIntroCopy> = {
  en: {
    iosTitle: 'Why add Get Word to home screen',
    iosSubtitle: '',
    androidTitle: 'Why add Get Word to home screen',
    androidSubtitle: '',
    benefitChips: [
      { title: 'Better offline', description: '' },
      { title: 'Easier access', description: '' },
      { title: 'No browser bar', description: '' },
    ],
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
    safariBannerLabel: 'YOU NEED SAFARI',
    safariBannerHeadline: 'Only Safari can fully install this on iPhone / iPad.',
    safariBannerBodyBefore: 'Open this page in Safari and follow the steps below. You can reopen these instructions any time via the menu ',
    safariBannerMenuLabel: 'Add to home screen',
    safariBannerBodyAfter: '.',
    iosStepsLabel: 'STEPS',
    iosStepsBadge: 'iOS · Safari',
    iosSteps: [
      { text: 'Tap the ', bold: '… dots', alt: '' },
      { text: 'Tap the ', bold: 'Share', alt: 'Share' },
      { text: 'Scroll down or tap ', bold: 'Show more', alt: 'View more' },
      { text: 'Choose ', bold: 'Add to Home Screen', alt: '' },
      { text: 'Tap ', bold: 'Add', alt: 'Add' },
    ],
    videoLabel: 'Video guide',
    androidCtaLabel: 'Add to home screen',
    androidCtaHint: 'After tapping, confirm ',
    androidCtaHintBold: 'Install',
    desktopHint: 'Open your browser menu and choose "Install app" or "Add to Home screen".',
    skipInstallLabel: 'Continue without adding to home screen',
  },
  cs: {
    iosTitle: 'Proč přidat Get Word na plochu',
    iosSubtitle: '',
    androidTitle: 'Proč přidat Get Word na plochu',
    androidSubtitle: '',
    benefitChips: [
      { title: 'Lepší offline', description: '' },
      { title: 'Snadnější přístup', description: '' },
      { title: 'Bez lišty', description: '' },
    ],
    benefitList: [
      {
        title: 'Lepší offline podpora',
        description: 'Většinu funkcí zvládnete i bez stabilního připojení.',
      },
      {
        title: 'Snadnější přístup',
        description: 'Spustíte ji z plochy jedním klepnutím.',
      },
      {
        title: 'Bez lišty prohlížeče',
        description: 'Otevírá se jako samostatná aplikace.',
      },
    ],
    safariBannerLabel: 'POTŘEBUJETE SAFARI',
    safariBannerHeadline: 'Plnou instalaci na iPhone / iPad zvládne jen Safari.',
    safariBannerBodyBefore: 'Otevřete tuto stránku v Safari a postupujte podle návodu níže. Návod zobrazíte přes menu ',
    safariBannerMenuLabel: 'Přidat na plochu',
    safariBannerBodyAfter: '.',
    iosStepsLabel: 'POSTUP',
    iosStepsBadge: 'iOS · Safari',
    iosSteps: [
      { text: 'Stiskněte ', bold: '… tečky', alt: '' },
      { text: 'Stiskněte tlačítko ', bold: 'Sdílet', alt: 'Share' },
      { text: 'Posuňte níž nebo stiskněte ', bold: 'Zobrazit více', alt: 'View more' },
      { text: 'Vyberte ', bold: 'Přidat na plochu', alt: 'Add to Home Screen' },
      { text: 'Stiskněte ', bold: 'Přidat', alt: 'Add' },
    ],
    videoLabel: 'Video návod',
    androidCtaLabel: 'Přidat na plochu mobilu',
    androidCtaHint: 'Po stisknutí potvrďte v dialogu prohlížeče ',
    androidCtaHintBold: 'Instalovat',
    desktopHint: 'Otevřete menu prohlížeče a zvolte "Přidat na plochu".',
    skipInstallLabel: 'Pokračovat bez přidání na plochu',
  },
  vi: {
    iosTitle: 'Vì sao nên thêm Get Word vào màn hình chính',
    iosSubtitle: '',
    androidTitle: 'Vì sao nên thêm Get Word vào màn hình chính',
    androidSubtitle: '',
    benefitChips: [
      { title: 'Offline tốt hơn', description: '' },
      { title: 'Dễ truy cập', description: '' },
      { title: 'Không có thanh', description: '' },
    ],
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
    safariBannerLabel: 'CẦN SAFARI',
    safariBannerHeadline: 'Trên iPhone / iPad, chỉ Safari mới cài được đầy đủ.',
    safariBannerBodyBefore: 'Mở trang này trong Safari rồi làm theo hướng dẫn bên dưới. Bạn có thể mở lại hướng dẫn bất kỳ lúc nào qua menu ',
    safariBannerMenuLabel: 'Thêm vào màn hình chính',
    safariBannerBodyAfter: '.',
    iosStepsLabel: 'CÁC BƯỚC',
    iosStepsBadge: 'iOS · Safari',
    iosSteps: [
      { text: 'Chạm vào ', bold: '… dấu chấm', alt: '' },
      { text: 'Chạm nút ', bold: 'Chia sẻ', alt: 'Share' },
      { text: 'Cuộn xuống hoặc chạm ', bold: 'Xem thêm', alt: 'View more' },
      { text: 'Chọn ', bold: 'Thêm vào màn hình chính', alt: 'Add to Home Screen' },
      { text: 'Chạm ', bold: 'Thêm', alt: 'Add' },
    ],
    videoLabel: 'Video hướng dẫn',
    androidCtaLabel: 'Thêm vào màn hình chính',
    androidCtaHint: 'Sau khi chạm, xác nhận ',
    androidCtaHintBold: 'Cài đặt',
    desktopHint: 'Mở menu trình duyệt và chọn "Cài đặt ứng dụng" hoặc "Thêm vào Màn hình chính".',
    skipInstallLabel: 'Tiếp tục mà không thêm vào màn hình chính',
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
