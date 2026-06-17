'use client';

import { useI18n } from '@/components/I18nProvider';

// Opens a private 1:1 chat with the Get Word support bot on Telegram.
export const SUPPORT_TELEGRAM_URL = 'https://t.me/get_word_support_bot';

export function SupportButton() {
  const { t } = useI18n();
  const label = t('support.chat');

  return (
    <a
      href={SUPPORT_TELEGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="fixed z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-accent shadow-sm transition-colors hover:bg-accent hover:text-background"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
        right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
      }}
    >
      {/* Telegram glyph — signals the chat opens in Telegram */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
      </svg>
    </a>
  );
}
