'use client';

import { useState } from 'react';
import type { WordList } from './page';

interface ListSidebarProps {
  lists: WordList[];
  selectedListId: string | null;
  subscribedListIds: Set<string>;
  onSelectList: (id: string) => void;
  onCreateList: (name: string, langFrom: string, langTo: string) => Promise<void>;
  onSubscribe: (listId: string) => Promise<void>;
  onUnsubscribe: (listId: string) => Promise<void>;
}

export function ListSidebar({
  lists,
  selectedListId,
  subscribedListIds,
  onSelectList,
  onCreateList,
  onSubscribe,
  onUnsubscribe,
}: ListSidebarProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLangFrom, setNewLangFrom] = useState('cs');
  const [newLangTo, setNewLangTo] = useState('vi');
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const ownLists = lists.filter((l) => l.ownerId !== null);
  const publicLists = lists.filter((l) => l.ownerId === null && l.isPublic);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onCreateList(newName.trim(), newLangFrom, newLangTo);
      setNewName('');
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleSubscription(listId: string) {
    setTogglingId(listId);
    try {
      if (subscribedListIds.has(listId)) {
        await onUnsubscribe(listId);
      } else {
        await onSubscribe(listId);
      }
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border-subtle">
        <h2 className="text-lg font-semibold text-text">Word Lists</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {ownLists.length > 0 && (
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-medium text-text-soft uppercase tracking-wide">
              Your Lists
            </h3>
            {ownLists.map((list) => (
              <button
                key={list.id}
                type="button"
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedListId === list.id
                    ? 'bg-accent/15 text-accent'
                    : 'text-text hover:bg-background/50'
                }`}
                onClick={() => onSelectList(list.id)}
              >
                <div className="font-medium truncate">{list.name}</div>
                <div className="text-xs text-text-soft mt-0.5">
                  {list.languageFrom} → {list.languageTo}
                </div>
              </button>
            ))}
          </div>
        )}

        {publicLists.length > 0 && (
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-medium text-text-soft uppercase tracking-wide">
              Curated Lists
            </h3>
            {publicLists.map((list) => {
              const isSubscribed = subscribedListIds.has(list.id);
              const isToggling = togglingId === list.id;

              return (
                <div
                  key={list.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedListId === list.id
                      ? 'bg-accent/15'
                      : 'hover:bg-background/50'
                  }`}
                >
                  <button
                    type="button"
                    className={`flex-1 text-left min-w-0 ${
                      selectedListId === list.id ? 'text-accent' : 'text-text'
                    }`}
                    onClick={() => onSelectList(list.id)}
                  >
                    <div className="font-medium truncate">{list.name}</div>
                    <div className="text-xs text-text-soft mt-0.5">
                      {list.languageFrom} → {list.languageTo}
                    </div>
                  </button>

                  {/* Subscription toggle */}
                  <button
                    type="button"
                    disabled={isToggling}
                    className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${
                      isSubscribed ? 'bg-accent' : 'bg-border-subtle'
                    } ${isToggling ? 'opacity-50' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSubscription(list.id);
                    }}
                    title={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                    aria-label={isSubscribed ? `Unsubscribe from ${list.name}` : `Subscribe to ${list.name}`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        isSubscribed ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border-subtle">
        {showCreate ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="List name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border-subtle text-text text-sm focus:outline-none focus:border-accent"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <select
                value={newLangFrom}
                onChange={(e) => setNewLangFrom(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs"
              >
                <option value="cs">Czech</option>
                <option value="vi">Vietnamese</option>
                <option value="en">English</option>
              </select>
              <span className="text-text-soft self-center text-xs">→</span>
              <select
                value={newLangTo}
                onChange={(e) => setNewLangTo(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs"
              >
                <option value="vi">Vietnamese</option>
                <option value="cs">Czech</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-1.5 rounded-lg border border-border-subtle text-text text-xs hover:bg-background/50"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating || !newName.trim()}
                className="flex-1 py-1.5 rounded-lg bg-accent text-background text-xs font-medium disabled:opacity-50"
                onClick={handleCreate}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="w-full py-2 rounded-lg border border-dashed border-border-subtle text-text-soft text-sm hover:border-accent hover:text-accent transition-colors"
            onClick={() => setShowCreate(true)}
          >
            + New List
          </button>
        )}
      </div>
    </div>
  );
}
