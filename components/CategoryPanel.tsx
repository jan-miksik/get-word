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
        <div className="category-panel-header" style={{ position: 'relative' }}>
          <h2>Filter by Category</h2>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                background: 'transparent',
                border: 'none',
                fontSize: '1.25rem',
                color: 'var(--text-soft)',
                cursor: 'pointer',
                padding: '0.25rem',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-soft)';
              }}
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
