'use client';

interface CategoryPanelProps {
  isOpen: boolean;
  categories: Array<{ name: string; count: number }>;
  selectedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  onClose?: () => void;
}

export function CategoryPanel({
  isOpen,
  categories,
  selectedCategories,
  onToggleCategory,
  onClose,
}: CategoryPanelProps) {
  return (
    <section
      className={`category-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Category filter"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3.5 pt-3.5 pb-4">
        <div className="flex items-center justify-between gap-3 mb-3 relative">
          <h2 className="m-0 text-[1.05rem]">Filter by Category</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-md p-1 text-[1.25rem] text-text-soft transition-colors duration-150 hover:bg-background-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              aria-label="Close category filter"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <p className="m-0 text-text-soft">No categories available.</p>
          ) : (
            categories.map((cat) => (
              <label
                key={cat.name}
                className={`category-chip ${selectedCategories.has(cat.name) ? 'is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={selectedCategories.has(cat.name)}
                  onChange={() => onToggleCategory(cat.name)}
                />
                <span className="category-chip-label font-semibold tracking-[0.01em]">{cat.name}</span>
                <span className="category-chip-count text-[0.8rem] text-text-soft px-2 py-0.5 rounded-pill bg-[rgba(148,163,184,0.15)] border border-[rgba(148,163,184,0.25)]">{cat.count}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
