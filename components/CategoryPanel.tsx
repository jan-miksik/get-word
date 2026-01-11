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
      <div className="category-panel-inner">
        <div className="category-panel-header relative">
          <h2>Filter by Category</h2>
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
        <div className="category-grid">
          {categories.length === 0 ? (
            <p className="category-empty">No categories available.</p>
          ) : (
            categories.map((cat) => (
              <label
                key={cat.name}
                className={`category-chip ${selectedCategories.has(cat.name) ? 'is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.has(cat.name)}
                  onChange={() => onToggleCategory(cat.name)}
                />
                <span className="category-chip-label">{cat.name}</span>
                <span className="category-chip-count">{cat.count}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
