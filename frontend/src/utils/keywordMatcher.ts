import type { CompetencyGuide } from '@/types/session';

/**
 * Determines if a keyword is Korean (contains Hangul characters).
 */
function isKorean(keyword: string): boolean {
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(keyword);
}

/**
 * Checks if a Korean keyword exists in the text (case-insensitive inclusion).
 */
function matchKorean(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

/**
 * Checks if an English keyword exists in the text using word boundary matching.
 */
function matchEnglish(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

/**
 * Matches interviewer text against competency guide keywords.
 * Returns an array of matched guide IDs.
 *
 * - Korean keywords: simple case-insensitive inclusion check
 * - English keywords: word boundary regex matching
 */
export function matchKeywords(text: string, guides: CompetencyGuide[]): string[] {
  if (!text || !guides || guides.length === 0) {
    return [];
  }

  const matchedIds: string[] = [];

  for (const guide of guides) {
    if (!guide.keywords || guide.keywords.length === 0) continue;

    const hasMatch = guide.keywords.some((keyword) => {
      if (!keyword) return false;
      if (isKorean(keyword)) {
        return matchKorean(text, keyword);
      }
      return matchEnglish(text, keyword);
    });

    if (hasMatch) {
      matchedIds.push(guide.id);
    }
  }

  return matchedIds;
}
