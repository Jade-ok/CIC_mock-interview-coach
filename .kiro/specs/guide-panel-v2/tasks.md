# Guide Panel v2 — Tasks

> Maintained implementation record. Last verified: 2026-08-08.

- [x] Refactor `GuidePanel.tsx` to avoid predictive-question wording.
- [x] Add the `Key Competencies` section through `RoleSkillsHint`.
- [x] Combine target skills and evaluation priorities and limit the displayed competencies to three.
- [x] Add the `Experiences to Prepare` section.
- [x] Sort selected experiences by relevance and render at most three cards.
- [x] Keep experience cards compact by showing the title without organization.
- [x] Reuse STAR classification and keyword-chip utilities.
- [x] Keep all visible Guide Panel text in English.
- [x] Preserve semantic list markup and text labels for accessibility.
- [x] Memoize derived data by `analystOutput`.
- [x] Cover the two section headings, top-three limits, relevance ordering, absence handling, and non-predictive copy with unit/property tests.

## Verification

```bash
cd frontend
npm test -- --run src/components/__tests__/GuidePanel.test.tsx src/components/__tests__/GuidePanel.property.test.tsx
```

This feature is frontend-only; it does not require backend or infrastructure changes.
