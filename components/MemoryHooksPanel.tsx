'use client';

interface MemoryHooksPanelProps {
  isOpen: boolean;
}

export function MemoryHooksPanel({ isOpen }: MemoryHooksPanelProps) {
  return (
    <section
      className={`memory-hooks-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Memory Hooks Info"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="memory-hooks-panel-inner">
        <h2 className="memory-hooks-title">Memory Hooks (Mnemonic Techniques) – Quick Summary</h2>
        <div className="memory-hooks-content">
          <p>
            Memory hooks are temporary mental bridges that connect a new word to something you
            already know. The brain remembers images, emotions, stories, and associations, not
            isolated words.
          </p>

          <p>
            <strong>The most effective hooks are:</strong>
          </p>
          <ul>
            <li>
              <strong>Sound-based</strong> (the word sounds like something familiar)
            </li>
            <li>
              <strong>Visual and exaggerated</strong> (absurd, emotional, or funny images)
            </li>
            <li>
              <strong>Personal</strong> (linked to your own experiences)
            </li>
          </ul>

          <p>
            <strong>A good strategy is:</strong>
          </p>
          <ul>
            <li>Start with sound or letter similarity</li>
            <li>Add a quick visual image</li>
            <li>Use the word in context until the hook is no longer needed</li>
          </ul>

          <p>Memory hooks should be fast, imperfect, and disposable.</p>
          <p>Memory works best when you modify or create the final hook yourself.</p>
          <p>
            <strong>The goal is not to remember the hook — but to forget it once the word sticks.</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
