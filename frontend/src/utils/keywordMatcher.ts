import type { CompetencyGuide } from '@/types/session';

/** Escape user-provided guide keywords before placing them in a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a complete English keyword or phrase without matching it inside a
 * larger alphanumeric word. The comparison is case-insensitive and supports
 * punctuation in keywords such as "C++".
 */
function containsKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return false;

  const escaped = escapeRegExp(normalizedKeyword).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i').test(text);
}

/** Return the IDs of guides whose keywords occur in interviewer text. */
export function matchKeywords(text: string, guides: CompetencyGuide[]): string[] {
  if (!text || guides.length === 0) return [];

  return guides
    .filter((guide) => guide.keywords.some((keyword) => containsKeyword(text, keyword)))
    .map((guide) => guide.id);
}
