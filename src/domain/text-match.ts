/** Lowercase, strip accents and collapse anything that is not a letter or digit. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/**
 * True when `phrase` appears in `text` allowing a few OCR errors
 * (up to `maxErrorRatio` of the phrase length, compared word-window by word-window).
 */
export function fuzzyContains(text: string, phrase: string, maxErrorRatio = 0.2): boolean {
  const haystack = normalizeText(text).split(' ');
  const needle = normalizeText(phrase);
  const size = needle.split(' ').length;
  const budget = Math.floor(needle.length * maxErrorRatio);
  for (let i = 0; i + size <= haystack.length; i++) {
    if (levenshtein(haystack.slice(i, i + size).join(' '), needle) <= budget) return true;
  }
  return false;
}

export function findKeyword(text: string, keywords: readonly string[]): string | null {
  return keywords.find((k) => fuzzyContains(text, k)) ?? null;
}
