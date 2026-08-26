'use client';

import { memo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { AddressFormValue } from '@/lib/word-item-address-form';

/**
 * "Kamarádsky" / "Zdvořile" on a study card.
 *
 * This belongs to the QUESTION, not the answer, and must render before the card
 * is revealed. The two members of a pair share their source text ("How are
 * you?"), so without the chip a learner typing the answer has no way to know
 * which of the two wordings is being asked for and would be marked wrong for
 * writing the other one.
 *
 * The sibling's actual wording is deliberately NOT here — see
 * `AddressFormCounterpart`, which renders inside the answer side.
 */
export const AddressFormChip = memo(function AddressFormChip({
  form,
}: {
  form: AddressFormValue;
}) {
  const { t } = useI18n();
  return (
    <span
      className="inline-flex w-fit items-center rounded-full border border-current px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70"
      data-address-form={form}
    >
      {form === 'familiar' ? t('addressForm.familiar') : t('addressForm.polite')}
    </span>
  );
});

/**
 * The other wording of the pair, e.g. "Zdvořile: Wie geht es Ihnen?".
 *
 * Rendered inside the target-language row so it is covered exactly when the
 * answer is covered. Showing it next to the chip instead would hand the learner
 * a phrase two letters away from the answer they are being asked to produce.
 */
export const AddressFormCounterpart = memo(function AddressFormCounterpart({
  form,
  counterpart,
}: {
  /** The form of THIS card; the counterpart is the opposite one. */
  form: AddressFormValue;
  counterpart: string;
}) {
  const { t } = useI18n();
  const label =
    form === 'familiar'
      ? t('addressForm.counterpartPolite', { text: counterpart })
      : t('addressForm.counterpartFamiliar', { text: counterpart });
  return (
    <span className="mt-1 block text-[0.95rem] leading-snug opacity-60 sm:text-[1.15rem]">
      {label}
    </span>
  );
});
