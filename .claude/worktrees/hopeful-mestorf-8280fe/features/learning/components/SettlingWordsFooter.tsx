type SettlingWordsFooterProps = {
  showNotReady: boolean;
  settlingCount: number;
  onToggle: () => void;
};

export function SettlingWordsFooter({
  showNotReady,
  settlingCount,
  onToggle,
}: SettlingWordsFooterProps) {
  if (settlingCount === 0) return null;

  return (
    <div className="p-4 px-4 text-center border-t border-border-subtle mt-4">
      <button
        type="button"
        className="bg-background-elevated border border-border-subtle rounded-lg px-6 py-3 text-sm text-text cursor-pointer transition-all font-medium hover:bg-background-elevated"
        onClick={onToggle}
      >
        {showNotReady ? 'Hide' : 'Show'} {settlingCount} word{settlingCount !== 1 ? 's' : ''}{' '}
        settling in before repeat
      </button>
    </div>
  );
}
