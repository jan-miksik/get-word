import { describe, expect, it } from 'vitest';
import { toPlainItemText } from '../plainItemText';

describe('toPlainItemText', () => {
  it('drops bracketed notes', () => {
    expect(toPlainItemText('letenka (jednosměrná)')).toBe('letenka');
    expect(toPlainItemText('you [informal singular]')).toBe('you');
    expect(toPlainItemText('vé máy bay （một chiều）')).toBe('vé máy bay');
  });

  it('keeps the first of slash-separated alternatives', () => {
    expect(toPlainItemText('letenka / jízdenka')).toBe('letenka');
    expect(toPlainItemText('vstup/výstup')).toBe('vstup');
    expect(toPlainItemText('a/b/c')).toBe('a');
  });

  it('leaves slashes that are part of the text alone', () => {
    // Not alternatives: both sides have to be letters before the item loses one.
    expect(toPlainItemText('otevřeno 24/7')).toBe('otevřeno 24/7');
    expect(toPlainItemText('1/2 kila')).toBe('1/2 kila');
  });

  it('repairs the spacing the removal leaves behind', () => {
    expect(toPlainItemText('Kde je  účet (prosím) ?')).toBe('Kde je účet?');
  });

  it('never empties an item', () => {
    // A text that was nothing but a note keeps its wording; the learner can edit
    // or remove it, but it must not silently disappear from the batch.
    expect(toPlainItemText('(pouze poznámka)')).toBe('(pouze poznámka)');
  });

  it('leaves ordinary text untouched', () => {
    expect(toPlainItemText('  Chtěl bych zaplatit kartou.  ')).toBe(
      'Chtěl bych zaplatit kartou.',
    );
  });
});
