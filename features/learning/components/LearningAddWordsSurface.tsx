'use client';

import dynamic from 'next/dynamic';
import type { AppSurface } from '@/features/workspace/public.client';

function SurfaceLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center p-8">
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40 motion-reduce:animate-none"
      />
    </div>
  );
}

const AddWordsScreen = dynamic(
  () => import('@/features/word-chat/public.client').then((module) => module.loadAddWordsScreen()),
  { ssr: false, loading: SurfaceLoading },
);

const PhotoLabPage = dynamic(
  () => import('@/features/photo-lab/public.client').then((module) => module.loadPhotoLabPage()),
  { ssr: false, loading: SurfaceLoading },
);

interface LearningAddWordsSurfaceProps {
  languageFrom: string;
  languageTo: string;
  baseListId: string | null;
  activeSurface: AppSurface;
  visitedSurfaces: ReadonlySet<AppSurface>;
  photoLabEnabled: boolean;
  photoDisplayFontClass?: string;
  refreshAfterCommit: () => Promise<void>;
  onLanguagePairChange: (pair: { from: string; to: string }) => void | Promise<void>;
  onClose: () => void;
  onReplaceSurface: (surface: AppSurface) => void;
  onCommitted: (listId: string) => void;
}

/**
 * Lazily mounted add-words workspace, including its optional Photo Lab tab.
 * HomeClient decides navigation and list selection; this component owns the
 * heavy surface composition and keeps those chunks out of the study bundle.
 */
export function LearningAddWordsSurface({
  languageFrom,
  languageTo,
  baseListId,
  activeSurface,
  visitedSurfaces,
  photoLabEnabled,
  photoDisplayFontClass,
  refreshAfterCommit,
  onLanguagePairChange,
  onClose,
  onReplaceSurface,
  onCommitted,
}: LearningAddWordsSurfaceProps) {
  if (!visitedSurfaces.has('chat') && !visitedSurfaces.has('photo')) return null;

  return (
    <AddWordsScreen
      languageFrom={languageFrom}
      languageTo={languageTo}
      baseListId={baseListId}
      refreshAfterCommit={refreshAfterCommit}
      onLanguagePairChange={onLanguagePairChange}
      onClose={onClose}
      active={activeSurface !== 'study'}
      photoTabAvailable={photoLabEnabled}
      photoTabActive={activeSurface === 'photo'}
      onTabChange={(tab) => onReplaceSurface(tab === 'photo' ? 'photo' : 'chat')}
      photoTab={
        visitedSurfaces.has('photo') && photoLabEnabled
          ? ({ pickWords }) => (
              <div className={photoDisplayFontClass ?? ''}>
                <PhotoLabPage
                  variant="embedded"
                  active={activeSurface === 'photo'}
                  hideLanguagePair
                  languageFrom={languageFrom}
                  languageTo={languageTo}
                  onLanguagePairChange={onLanguagePairChange}
                  onPickWords={pickWords}
                />
              </div>
            )
          : undefined
      }
      onCommitted={(result) => onCommitted(result.listId)}
    />
  );
}
