import { GenderNeutralIcon, MarsIcon, VenusIcon } from '@/components/icons/AppIcons';
import type { WordChatSalutationGender } from '../types';

/**
 * Decorative marker for a salutation choice. The visible label carries the
 * meaning, so this is always `aria-hidden` via the underlying glyphs.
 */
function SalutationGenderIcon({
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

/**
 * The icon in its round badge, as it sits inside a salutation option button.
 *
 * The badge takes its colour from the button underneath: accent blue while the
 * button is plain cream, and the button's own text colour once the button fills
 * with accent — selected, or hovered with a real pointer. A fixed accent icon
 * disappeared into that fill, which is exactly when the chosen option most
 * needs to be readable.
 *
 * Needs `group` on the button for the hover half.
 */
export function SalutationGenderBadge({
  gender,
  selected,
}: {
  gender: WordChatSalutationGender;
  selected: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        selected
          ? 'bg-[color:color-mix(in_srgb,currentColor_22%,transparent)] text-current'
          : 'bg-[color:color-mix(in_srgb,var(--ob-accent)_14%,transparent)] text-[var(--ob-accent)] group-hover:bg-[color:color-mix(in_srgb,currentColor_22%,transparent)] group-hover:text-current',
      ].join(' ')}
    >
      <SalutationGenderIcon gender={gender} />
    </span>
  );
}
