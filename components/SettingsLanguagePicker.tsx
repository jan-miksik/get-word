'use client';

import { InterfaceLanguageSelector } from '@/components/InterfaceLanguageSelector';

interface SettingsLanguagePickerProps {
  value: string;
  onChange: (language: string) => void;
  compact?: boolean;
}

export function SettingsLanguagePicker({
  value,
  onChange,
  compact = false,
}: SettingsLanguagePickerProps) {
  return (
    <InterfaceLanguageSelector
      value={value}
      onChange={onChange}
      compact={compact}
      align="left"
    />
  );
}
