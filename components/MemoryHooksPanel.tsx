'use client';

interface MemoryHooksPanelProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function MemoryHooksPanel({ isOpen, onClose }: MemoryHooksPanelProps) {
  return (
    <section
      className={`memory-hooks-panel ${isOpen ? 'is-open fixed inset-0' : ''}`}
      aria-label="Memory Hooks Info"
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div
          className="panel-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}
      <div className="panel-content">
      <div className="p-5">
        <div className="relative">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-0 right-0 bg-transparent border-none text-xl text-text-soft cursor-pointer p-1 leading-none flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-background-elevated hover:text-text"
              aria-label="Close memory hooks info"
            >
              ×
            </button>
          )}
          <h2 className="m-0 mb-4 text-[1.1rem] font-semibold text-text leading-[1.4]">Memory Hooks (Mnemonic Techniques) – Quick Summary</h2>
        </div>
        <div className="text-[0.9rem] leading-relaxed text-text-soft">
          <p className="mb-3">
            Memory hooks are temporary mental bridges that connect a new word to something you
            already know. The brain remembers images, emotions, stories, and associations, not
            isolated words.
          </p>

          <p className="mb-3">
            <strong className="text-text font-semibold">The most effective hooks are:</strong>
          </p>
          <ul className="my-2 mb-3 pl-6">
            <li className="mb-2">
              <strong className="text-text font-semibold">Sound-based</strong> (the word sounds like something familiar)
            </li>
            <li className="mb-2">
              <strong className="text-text font-semibold">Visual and exaggerated</strong> (absurd, emotional, or funny images)
            </li>
            <li className="mb-2">
              <strong className="text-text font-semibold">Personal</strong> (linked to your own experiences)
            </li>
          </ul>

          <p className="mb-3">
            <strong className="text-text font-semibold">A good strategy is:</strong>
          </p>
          <ul className="my-2 mb-3 pl-6">
            <li className="mb-2">Start with sound or letter similarity</li>
            <li className="mb-2">Add a quick visual image</li>
            <li className="mb-2">Use the word in context until the hook is no longer needed</li>
          </ul>

          <p className="mb-3">Memory hooks should be fast, imperfect, and disposable.</p>
          <p className="mb-3">Memory works best when you modify or create the final hook yourself.</p>
          <p className="mb-0">
            <strong className="text-text font-semibold">The goal is not to remember the hook — but to forget it once the word sticks.</strong>
          </p>
        </div>
      </div>
      </div>
    </section>
  );
}
