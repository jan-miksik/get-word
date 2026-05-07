export function matchAnswer(input: string, correct: string): 'exact' | 'close' | 'wrong' {
  const trim = (value: string) => value.trim().toLowerCase();
  if (trim(input) === trim(correct)) return 'exact';

  const strip = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .trim()
      .toLowerCase();

  if (strip(input) === strip(correct)) return 'close';
  return 'wrong';
}
