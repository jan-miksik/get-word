'use client';

interface CategoryPanelProps {
  isOpen: boolean;
  categories: Array<{ name: string; count: number }>;
  selectedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
}

export function CategoryPanel({
  isOpen,
  categories,
  selectedCategories,
  onToggleCategory,
}: CategoryPanelProps) {
  return (
    <section
      className={`category-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Category filter"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="category-panel-inner">
        <div className="category-panel-header">
          <h2>Filter by Category</h2>
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
