import { GenderNeutralIcon, MarsIcon, VenusIcon } from '@/components/icons/AppIcons';
import type { WordChatSalutationGender } from '../types';

/**
 * Decorative marker for a salutation choice. The visible label carries the
 * meaning, so this is always `aria-hidden` via the underlying glyphs.
 */
export function SalutationGenderIcon({
  gender,
  size = 19,
}: {
  gender: WordChatSalutationGender;
  size?: number;
}) {
  if (gender === 'female') return <VenusIcon size={size} />;
  if (gender === 'male') return <MarsIcon size={size} />;
  return <GenderNeutralIcon size={size} />;
}
