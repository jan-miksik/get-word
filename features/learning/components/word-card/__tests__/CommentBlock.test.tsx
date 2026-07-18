import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { CommentBlock } from '../CommentBlock';
import type { WordItemComment } from '@/lib/word-item-comment';

const comment: WordItemComment = {
  version: 1,
  text: 'Pozor: temps může znamenat čas i počasí.',
  source: 'generated',
  mentions: [{ word: 'temps', language: 'to', frequency: 3 }],
};

function renderBlock(
  props: Partial<React.ComponentProps<typeof CommentBlock>> = {},
) {
  return render(
    <I18nProvider language="en">
      <CommentBlock
        comment={comment}
        listId="list-1"
        itemId="item-1"
        defaultMinimized={false}
        {...props}
      />
    </I18nProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe('CommentBlock', () => {
  it('renders the note text and a frequency mention chip when expanded', () => {
    renderBlock();
    expect(screen.getByText(comment.text)).toBeInTheDocument();
    // chip exposes the localized frequency via aria-label
    expect(screen.getByLabelText('temps: common')).toBeInTheDocument();
  });

  it('renders as a chip (no body text) when default-minimized', () => {
    renderBlock({ defaultMinimized: true });
    expect(screen.queryByText(comment.text)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show study note' })).toBeInTheDocument();
  });

  it('collapses when the opened note is tapped and persists the override', () => {
    const { rerender } = renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'Hide study note' }));
    expect(screen.queryByText(comment.text)).not.toBeInTheDocument();

    // A fresh mount with the same identity reads the persisted collapse.
    rerender(
      <I18nProvider language="en">
        <CommentBlock comment={comment} listId="list-1" itemId="item-1" defaultMinimized={false} />
      </I18nProvider>,
    );
    expect(screen.queryByText(comment.text)).not.toBeInTheDocument();
  });

  it('lets a changed stage default override a previously persisted collapse', () => {
    const { rerender } = renderBlock({ defaultMinimized: true });
    fireEvent.click(screen.getByRole('button', { name: 'Show study note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide study note' }));
    expect(screen.queryByText(comment.text)).not.toBeInTheDocument();

    rerender(
      <I18nProvider language="en">
        <CommentBlock comment={comment} listId="list-1" itemId="item-1" defaultMinimized={false} />
      </I18nProvider>,
    );

    expect(screen.getByText(comment.text)).toBeInTheDocument();
  });

  it('expands a default-minimized note on tap', () => {
    renderBlock({ defaultMinimized: true });
    fireEvent.click(screen.getByRole('button', { name: 'Show study note' }));
    expect(screen.getByText(comment.text)).toBeInTheDocument();
  });

  it('keeps the minimized note trigger icon-only', () => {
    renderBlock({ defaultMinimized: true });

    expect(screen.getByRole('button', { name: 'Show study note' })).toHaveTextContent('');
  });

  it('renders in the stable note slot used to avoid layout shifts', () => {
    const { container } = renderBlock();

    expect(container.querySelector('.study-note-shell')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Hide study note' })).toHaveClass('study-note');
  });

  it('discards a stale collapse override when the comment text changes', () => {
    // Persist a collapse for the original text.
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'Hide study note' }));
    cleanup();

    // New text → hash mismatch → override ignored, falls back to defaultMinimized=false.
    const edited: WordItemComment = { ...comment, text: 'Different note entirely.' };
    render(
      <I18nProvider language="en">
        <CommentBlock comment={edited} listId="list-1" itemId="item-1" defaultMinimized={false} />
      </I18nProvider>,
    );
    expect(screen.getByText('Different note entirely.')).toBeInTheDocument();
  });
});
