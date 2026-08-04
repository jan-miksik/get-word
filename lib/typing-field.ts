const NON_TYPING_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * True for the elements whose focus opens the on-screen keyboard: text-like
 * inputs, textareas, and rich-text hosts. The pressable input types are
 * excluded — focusing a checkbox leaves the screen exactly as it was.
 */
export function isTypingField(node: EventTarget | null): boolean {
  if (node instanceof HTMLTextAreaElement) return true;
  if (node instanceof HTMLInputElement) return !NON_TYPING_INPUT_TYPES.has(node.type);
  return node instanceof HTMLElement && node.isContentEditable;
}
