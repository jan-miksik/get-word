import { normalizeLanguageCode } from '@/lib/i18n/languages';

export type PWAInstallIntroCopy = {
  title: string;
  body: string;
  advantagesLabel: string;
  advantages: string[];
  installLabel: string;
  laterLabel: string;
  gotItLabel: string;
  iosSafariStepsLabel: string;
  iosSafariSteps: string[];
  iosSafariFootnote: string;
  iosNonSafariNote: string;
  desktopHint: string;
};

const copyByLanguage: Record<string, PWAInstallIntroCopy> = {
  en: {
    title: 'Install Get Word as an app',
    body: 'Add Get Word to your home screen for a faster, more focused way to learn.',
    advantagesLabel: 'Why install',
    advantages: [
      'Opens like a real app — no browser bar.',
      'Launches from your home screen with one tap.',
      'Works offline after the first load.',
    ],
    installLabel: 'Install',
    laterLabel: 'Maybe later',
    gotItLabel: 'Got it',
    iosSafariStepsLabel: 'How to install on iPhone / iPad',
    iosSafariSteps: [
      'Tap the Share button at the bottom of Safari.',
      'Scroll down and tap "Add to Home Screen".',
      'Tap "Add" in the top-right corner.',
    ],
    iosSafariFootnote: 'Only Safari can fully install this on iPhone / iPad.',
    iosNonSafariNote:
      'On iPhone / iPad, installing this app only works in Safari. Other browsers (Chrome, Firefox, etc.) cannot install it properly. Open this page in Safari to install.',
    desktopHint: 'Open your browser menu and choose "Install app" or "Add to Home screen".',
  },
  cs: {
    title: 'Nainstalujte si Get Word jako aplikaci',
    body: 'Přidejte Get Word na plochu - učení bude rychlejší a bez rušivých prvků prohlížeče.',
    advantagesLabel: 'Proč instalovat',
    advantages: [
      'Otevírá se jako opravdová aplikace - bez lišty prohlížeče.',
      'Spustíte ji z plochy jedním klepnutím.',
      'Po prvním načtení funguje i offline.',
    ],
    installLabel: 'Instalovat',
    laterLabel: 'Možná později',
    gotItLabel: 'Rozumím',
    iosSafariStepsLabel: 'Jak nainstalovat na iPhone / iPad',
    iosSafariSteps: [
      'Klepněte na tlačítko Sdílet ve spodní liště Safari.',
      'Posuňte níž a klepněte na "Přidat na plochu".',
      'Klepněte na "Přidat" v pravém horním rohu.',
    ],
    iosSafariFootnote: 'Na iPhonu / iPadu lze aplikaci plně nainstalovat jen v Safari.',
    iosNonSafariNote:
      'Na iPhonu / iPadu instalace funguje pouze v prohlížeči Safari. Ostatní prohlížeče (Chrome, Firefox apod.) ji neumí správně nainstalovat. Otevřete tuto stránku v Safari a pak nainstalujte.',
    desktopHint: 'Otevřete menu prohlížeče a zvolte "Nainstalovat aplikaci" nebo "Přidat na plochu".',
  },
  vi: {
    title: 'Cài Get Word như một ứng dụng',
    body: 'Thêm Get Word vào màn hình chính để học nhanh hơn và tập trung hơn.',
    advantagesLabel: 'Vì sao nên cài',
    advantages: [
      'Mở như ứng dụng thật - không có thanh trình duyệt.',
      'Khởi chạy từ màn hình chính chỉ với một chạm.',
      'Hoạt động offline sau lần tải đầu tiên.',
    ],
    installLabel: 'Cài đặt',
    laterLabel: 'Để sau',
    gotItLabel: 'Đã hiểu',
    iosSafariStepsLabel: 'Cách cài trên iPhone / iPad',
    iosSafariSteps: [
      'Chạm vào nút Chia sẻ ở dưới cùng của Safari.',
      'Cuộn xuống và chạm "Thêm vào Màn hình chính".',
      'Chạm "Thêm" ở góc trên bên phải.',
    ],
    iosSafariFootnote: 'Trên iPhone / iPad, chỉ Safari mới cài được đầy đủ.',
    iosNonSafariNote:
      'Trên iPhone / iPad, việc cài ứng dụng chỉ hoạt động trong Safari. Các trình duyệt khác (Chrome, Firefox...) không cài được đầy đủ. Hãy mở trang này trong Safari rồi cài.',
    desktopHint: 'Mở menu trình duyệt và chọn "Cài đặt ứng dụng" hoặc "Thêm vào Màn hình chính".',
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
