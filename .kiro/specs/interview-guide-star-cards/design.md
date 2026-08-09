# Design Document — Interview Guide STAR Cards

> Superseded historical design. See `../guide-panel-v2/design.md` for the maintained two-section, English-only, non-predictive Guide Panel design.

## Architecture Overview

This feature replaces the dynamic keyword-matching competency guide cards with static, analyst-driven STAR-method preparation cards. The data flow simplifies from a speech-reactive pipeline to a one-time render-time computation:

```
AnalystOutput (from agent1Client)
  → starCategoryMatcher (pure utility — classifies each plan item)
  → GuidePanel (renders up to 3 StarCards)
```

### Component Relationships

```
InterviewScreen
├── ParticipantTiles
├── PracticeBubbles (unchanged)
├── MicButton
├── ControlBar (practiceMode toggle still here)
└── [practiceMode === true]
    └── GuidePanel (receives analystOutput)
         └── internally calls classifyStarCategory() per plan item
```

**Removed data paths:**
- `competencyGuides` state field → removed from reducer, types, and all consumers
- `keywordMatcher.ts` utility → deleted
- `currentInterviewerText` prop on GuidePanel → removed
- `competency_guides` in Agent1Response / Agent3Request → removed

**Preserved data paths:**
- `analystOutput` remains in SessionState (already stored by reducer)
- `callAgent3` continues sending `analyst_output` + `transcript`
- Panel visibility gated by `state.practiceMode` (unchanged)


---

## New Utility: `frontend/src/utils/starCategoryMatcher.ts`

### Types

```typescript
export interface StarCategory {
  label: string;
  triggerKeywords: string[];
  starElements: string[];
  reasoning: string; // Korean reasoning text
}

export interface StarClassification {
  label: string;
  starElements: string[];
  reasoning: string;
}
```

### STAR Category Table (hardcoded, priority-ordered)

```typescript
const STAR_CATEGORIES: StarCategory[] = [
  {
    label: 'Above & Beyond / Problem Solving',
    triggerKeywords: ['beyond', 'extra', 'above'],
    starElements: ['Task', 'Action'],
    reasoning: 'Why you set a higher bar than expected and how you solved it',
  },
  {
    label: 'Team Experience',
    triggerKeywords: ['team', 'conflict', 'collaborat', 'disagreement'],
    starElements: ['Action', 'Result'],
    reasoning: 'What you did within the team and how it affected relationships or outcomes',
  },
  {
    label: 'Initiative',
    triggerKeywords: ['initiative', 'self-motivat', 'own idea', 'ownership', 'autonom'],
    starElements: ['Task'],
    reasoning: 'Show that you set your own goal without being told',
  },
  {
    label: 'Leadership',
    triggerKeywords: ['lead', 'leadership', 'mentor', 'delegate'],
    starElements: ['Action', 'Result'],
    reasoning: 'How you moved the team and what changed as a result',
  },
  {
    label: 'Failure / Mistake',
    triggerKeywords: ['failure', 'mistake', 'fail', 'wrong'],
    starElements: ['Learning', 'Action'],
    reasoning: 'Focus on acknowledging the failure, what you learned, and what you changed',
  },
  {
    label: 'Pressure and Time Management',
    triggerKeywords: ['deadline', 'pressure', 'time management', 'prioritiz'],
    starElements: ['Action'],
    reasoning: 'Explain what you prioritized first and why',
  },
  {
    label: 'Problem Solving',
    triggerKeywords: ['problem', 'solve', 'debug', 'issue', 'implement', 'technical', 'develop', 'design'],
    starElements: ['Action'],
    reasoning: 'Explain your approach, iterations, and adjustments',
  },
  {
    label: 'Communication',
    triggerKeywords: ['communicat', 'explain', 'non-technical'],
    starElements: ['Situation', 'Action'],
    reasoning: 'Identify the audience and explain how you adapted your communication',
  },
];
```


### Default Category (fallback)

```typescript
const DEFAULT_CLASSIFICATION: StarClassification = {
  label: 'General',
  starElements: ['Situation', 'Task', 'Action', 'Result'],
  reasoning: 'Keep Situation and Task brief; make your Actions and Results specific.',
};
```

### Matching Function

```typescript
/**
 * Classifies a single interview plan item into a STAR category.
 *
 * Algorithm:
 * 1. Concatenate topic + " " + target_skill
 * 2. Convert to lowercase
 * 3. Iterate categories in priority order (index 0 = highest)
 * 4. For each category, check if ANY trigger keyword is found
 *    via combinedString.includes(keyword)
 * 5. Return the first match; if none match, return DEFAULT_CLASSIFICATION
 */
export function classifyStarCategory(topic: string, targetSkill: string): StarClassification {
  const combined = `${topic} ${targetSkill}`.toLowerCase();

  for (const category of STAR_CATEGORIES) {
    const matched = category.triggerKeywords.some(
      (keyword) => combined.includes(keyword)
    );
    if (matched) {
      return {
        label: category.label,
        starElements: category.starElements,
        reasoning: category.reasoning,
      };
    }
  }

  return DEFAULT_CLASSIFICATION;
}
```

Key design decisions:
- **Pure function**: no side effects, easily testable
- **`includes()` not regex**: per requirement 1.3
- **Priority via iteration order**: first match wins, higher-priority categories checked first
- **Separate from component**: enables unit testing without React

---

## Rebuilt `GuidePanel.tsx`

### New Props Interface

```typescript
interface GuidePanelProps {
  analystOutput: Record<string, unknown> | null;
}
```

Removed props: `guides`, `practiceMode`, `currentInterviewerText`

The component no longer needs `practiceMode` (parent already gates visibility) or speech text (cards are static).


### Internal Data Model (computed at render time via `useMemo`)

```typescript
interface StarCardData {
  index: number;                    // 1-based
  topic: string;
  classification: StarClassification;
  keywordChips: string[];
  relatedExperience: { title: string; organization: string } | null;
}
```

### Card Derivation Logic (inside component)

```typescript
const cards: StarCardData[] = useMemo(() => {
  if (!analystOutput) return [];

  const plan = (analystOutput.interview_plan || []) as InterviewPlanItem[];
  const targetRole = analystOutput.target_role as TargetRole | undefined;
  const experiences = (analystOutput.selected_experiences || []) as SelectedExperience[];

  // Take first 3 items
  return plan.slice(0, 3).map((item, idx) => {
    // 1. Classify STAR category
    const classification = classifyStarCategory(item.topic, item.target_skill);

    // 2. Derive keyword chips
    const chips = deriveKeywordChips(item, targetRole);

    // 3. Resolve related experience
    const exp = item.source_experience_id
      ? experiences.find(e => e.experience_id === item.source_experience_id) ?? null
      : null;

    return {
      index: idx + 1,
      topic: item.topic,
      classification,
      keywordChips: chips,
      relatedExperience: exp ? { title: exp.title, organization: exp.organization } : null,
    };
  });
}, [analystOutput]);
```

### Keyword Chip Derivation

```typescript
function deriveKeywordChips(
  item: InterviewPlanItem,
  targetRole: TargetRole | undefined
): string[] {
  const chips: string[] = [item.target_skill];
  if (!targetRole) return chips;

  const combined = `${item.target_skill} ${item.topic}`.toLowerCase();
  const allSkills = [
    ...(targetRole.required_skills || []),
    ...(targetRole.preferred_skills || []),
  ];

  for (const skill of allSkills) {
    if (combined.includes(skill.toLowerCase()) && !chips.includes(skill)) {
      chips.push(skill);
    }
  }

  return chips;
}
```


### Render Structure (per card)

```
<li class="star-card">
  <span class="star-card__label">Expected Question 1</span>
  <p class="star-card__topic">{topic}</p>
  <div class="star-card__chips">{keywordChips.map → pill}</div>
  <div class="star-card__star-section">
    <span class="star-card__category-label">{classification.label}</span>
    <div class="star-card__elements">{starElements.map → badge}</div>
    <span class="star-card__reasoning">{classification.reasoning}</span>
  </div>
  {relatedExperience && (
    <div class="star-card__experience">
      <span>{experience.title}</span> · <span>{experience.organization}</span>
    </div>
  )}
</li>
```

---

## Modifications to `InterviewScreen.tsx`

### Before (current)

```tsx
<GuidePanel
  guides={state.competencyGuides}
  practiceMode={state.practiceMode}
  currentInterviewerText={latestInterviewerText}
/>
```

### After

```tsx
<GuidePanel analystOutput={state.analystOutput} />
```

### Other changes in InterviewScreen:
- Remove `state.competencyGuides` from `triggerAgent3` dependency (it passes to callAgent3 which no longer needs it)
- Update `callAgent3` call to not include `competency_guides`

---

## Type Changes in `types/session.ts`

### Removals

```typescript
// DELETE: CompetencyGuide interface (entire interface removed)
// DELETE: competencyGuides field from SessionState
// DELETE: competency_guides field from Agent1Response
// DELETE: competency_guides field from Agent3Request
```

### Modified `SessionState`

```typescript
export interface SessionState {
  // ... all existing fields remain EXCEPT:
  // competencyGuides: CompetencyGuide[];  ← REMOVED
}
```

### Modified `Agent1Response`

```typescript
export interface Agent1Response {
  nova_sonic_context: string;
  // competency_guides: CompetencyGuide[];  ← REMOVED
  analyst_output?: Record<string, unknown>;
}
```

### Modified `Agent3Request`

```typescript
export interface Agent3Request {
  transcript: TranscriptEntry[];
  // competency_guides: CompetencyGuide[];  ← REMOVED
  analyst_output?: Record<string, unknown>;
}
```


---

## Service Changes

### `agent1Client.ts`

- Remove `mapToCompetencyGuides()` helper function entirely
- Remove the `competency_guides` field from the returned `Agent1Response`
- Keep returning `analyst_output` and `nova_sonic_context`

```typescript
// Before:
return {
  nova_sonic_context: novaSonicContext,
  competency_guides: competencyGuides,   // ← REMOVE
  analyst_output: analystOutput,
};

// After:
return {
  nova_sonic_context: novaSonicContext,
  analyst_output: analystOutput,
};
```

### `agent3Client.ts`

- Remove `competency_guides` from `Agent3Request` usage
- The `callAgent3` function already sends `analyst_output` and `transcript` in the request body — those remain
- Remove `request.competency_guides` reference (it's not used in the current `requestBody` construction anyway, only declared in the type)

---

## Reducer Changes (`sessionReducer.ts`)

### `initialState`

```typescript
// Remove:
competencyGuides: [],
```

### `AGENT1_SUCCESS` handler

```typescript
// Before:
case 'AGENT1_SUCCESS':
  return {
    ...state,
    agent1Ready: true,
    novaSonicContext: action.payload.nova_sonic_context,
    competencyGuides: action.payload.competency_guides,   // ← REMOVE
    analystOutput: action.payload.analyst_output ?? null,
    error: null,
  };

// After:
case 'AGENT1_SUCCESS':
  return {
    ...state,
    agent1Ready: true,
    novaSonicContext: action.payload.nova_sonic_context,
    analystOutput: action.payload.analyst_output ?? null,
    error: null,
  };
```

---

## File Deletion

- **Delete**: `frontend/src/utils/keywordMatcher.ts`
- Remove any test file for keywordMatcher if it exists

---

## CSS/Styling Approach

All styling uses CSS-in-JS via `<style>` tags (matching the existing pattern in GuidePanel and InterviewScreen). No external CSS files.

### CSS Variables Used

| Variable | Fallback | Usage |
|----------|----------|-------|
| `--color-tile-bg` | `#1C1C1E` | Card background |
| `--color-text-primary` | `#FFFFFF` | Topic text, card title |
| `--color-text-secondary` | `#A0A0A5` | Label, reasoning, chips, experience |
| `--color-guide-highlight` | `#4A9EFF` | STAR element badges |
| `--color-canvas` | `#0A0A0A` | Not used directly in cards |


### Card Styles

```css
.star-card {
  padding: 14px 16px;
  border-radius: 10px;
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  background-color: rgba(255, 255, 255, 0.03);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.star-card__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--color-guide-highlight, #4A9EFF);
  text-transform: uppercase;
}

.star-card__topic {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #FFFFFF);
  margin: 0;
  line-height: 1.4;
}

.star-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.star-card__chip {
  font-size: 11px;
  color: var(--color-text-secondary, #A0A0A5);
  background-color: rgba(255, 255, 255, 0.07);
  padding: 3px 10px;
  border-radius: 12px;
  white-space: nowrap;
}

.star-card__star-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.star-card__category-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary, #A0A0A5);
}

.star-card__elements {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.star-card__element-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-guide-highlight, #4A9EFF);
  background-color: rgba(74, 158, 255, 0.12);
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.star-card__reasoning {
  font-size: 12px;
  color: var(--color-text-secondary, #A0A0A5);
  line-height: 1.5;
}

.star-card__experience {
  font-size: 11px;
  color: var(--color-text-secondary, #A0A0A5);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 8px;
  margin-top: 2px;
}
```

---

## Testing Strategy

### Unit Tests: `starCategoryMatcher.test.ts`

**Framework**: Vitest

Tests for `classifyStarCategory`:

1. **Priority order**: given input matching multiple categories, assert the highest-priority one is returned
2. **Each category match**: one test per category confirming correct classification
3. **Default fallback**: input with no matching keywords returns default classification
4. **Case insensitivity**: mixed-case input still matches lowercase keywords
5. **Keyword in topic vs target_skill**: match works regardless of which field contains the keyword
6. **Empty strings**: empty topic + empty target_skill returns default

Tests for `deriveKeywordChips` (if exported, or tested via component):

1. **Always includes target_skill**: even when no role skills match
2. **Includes matching required_skills**: case-insensitive match
3. **Includes matching preferred_skills**: case-insensitive match
4. **No duplicates**: target_skill not repeated if it also appears in role skills

### Component Tests: `GuidePanel.test.tsx`

**Framework**: Vitest + React Testing Library

1. **Renders 3 cards from analyst output**: given 5 plan items, only 3 cards rendered
2. **Renders fewer cards if plan has fewer items**: given 2 plan items, 2 cards rendered
3. **Empty state when analystOutput is null**: no cards, no errors
4. **Empty state when interview_plan is empty array**: no cards
5. **Card labels show "Expected Question N"**: verify 1-based index
6. **Topic text is displayed**: verify `topic` field shown
7. **Keyword chips rendered**: verify derived chips present
8. **STAR section rendered**: verify label, element badges, reasoning text
9. **Related experience shown when available**: experience title + org displayed
10. **Related experience hidden when source_experience_id is null**: line not rendered
11. **STAR element badges use correct accent**: verify `data-testid` or class for blue styling


---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `analystOutput` is `null` | GuidePanel renders empty (no cards, no error) |
| `interview_plan` missing from analystOutput | Treated as empty array → no cards |
| `interview_plan` item has empty `topic` or `target_skill` | Classification falls to default; card still renders |
| `target_role` missing from analystOutput | Keyword chips contain only `target_skill` |
| `selected_experiences` missing from analystOutput | All cards show no related experience |
| `source_experience_id` doesn't match any experience | That card hides the experience line |

No error toasts or alerts — graceful degradation to empty/minimal UI.

---

## Interfaces and Data Models

### AnalystOutput Shape (subset used by GuidePanel)

```typescript
// These types are declared locally in GuidePanel or in a shared types file.
// They describe the analystOutput structure the component depends on.

interface InterviewPlanItem {
  topic: string;
  target_skill: string;
  source_experience_id: string | null;
  priority: number;
  question_type: string;
}

interface TargetRole {
  title: string;
  required_skills: string[];
  preferred_skills: string[];
}

interface SelectedExperience {
  experience_id: string;
  title: string;
  organization: string;
}
```

These are local utility types for safe casting of `analystOutput` fields. The `analystOutput` remains typed as `Record<string, unknown>` at the SessionState level to avoid coupling the frontend types to backend schema changes.

---

## Summary of File Changes

| File | Action |
|------|--------|
| `frontend/src/utils/starCategoryMatcher.ts` | **Create** — STAR category table + classifier |
| `frontend/src/utils/keywordMatcher.ts` | **Delete** |
| `frontend/src/components/GuidePanel.tsx` | **Rewrite** — new props, static card derivation |
| `frontend/src/components/InterviewScreen.tsx` | **Modify** — pass `analystOutput`, remove old props |
| `frontend/src/types/session.ts` | **Modify** — remove CompetencyGuide, update interfaces |
| `frontend/src/services/agent1Client.ts` | **Modify** — remove mapToCompetencyGuides, update return |
| `frontend/src/services/agent3Client.ts` | **Modify** — remove competency_guides from request type |
| `frontend/src/reducers/sessionReducer.ts` | **Modify** — remove competencyGuides from state/handler |
| `frontend/src/utils/__tests__/starCategoryMatcher.test.ts` | **Create** — unit tests |
| `frontend/src/components/__tests__/GuidePanel.test.tsx` | **Create** — RTL component tests |


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Acceptance Criteria Testing Prework

1.1 STAR Category Table contains exactly 8 categories in priority order
  Thoughts: This is a static configuration check. The table is hardcoded. We can verify its length and order, but this is a constant — running it 100 times doesn't add value.
  Classification: EXAMPLE
  Test Strategy: Single assertion that the exported table has 8 entries in correct order.

1.2 Concatenates topic + target_skill with space, lowercased
  Thoughts: This is about how all inputs are processed before matching. For any topic and target_skill, the combined string should equal `(topic + " " + target_skill).toLowerCase()`. This is a transformation property.
  Classification: PROPERTY
  Test Strategy: Generate random topic/targetSkill strings, verify the matching function operates on the correct combined lowercase string.

1.3 Iterates categories in order, returns first match via includes()
  Thoughts: This is a priority-ordering property. For any input that matches multiple categories, the one with the lowest index should win. We can generate inputs that hit multiple categories and verify the highest-priority one is returned.
  Classification: PROPERTY
  Test Strategy: Generate inputs with keywords from multiple categories, verify first-match semantics.

1.4 Default category when no keywords match
  Thoughts: For any input string that contains none of the trigger keywords from any category, the function should return the default. We can generate random strings that avoid all keywords.
  Classification: PROPERTY
  Test Strategy: Generate random strings not containing any trigger keywords, verify default is returned.

1.5 Category table structure (label, keywords array, elements array, reasoning string)
  Thoughts: Static structure check of a constant.
  Classification: EXAMPLE
  Test Strategy: Verify each category has all required fields with correct types.

2.1 Derives card data from first 3 items of interview_plan
  Thoughts: For any interview_plan with N items, the component should produce min(N, 3) cards. This is a metamorphic property on the plan length.
  Classification: PROPERTY
  Test Strategy: Generate plans of various lengths (0–10), verify card count is min(N, 3).

2.2 Fewer than 3 items → render only that many
  Thoughts: Subsumed by 2.1 property (min(N, 3)).
  Classification: PROPERTY (merged with 2.1)

2.3 Keyword chips include target_skill + matching role skills (case-insensitive)
  Thoughts: For any item and role skills list, the chips should always contain target_skill, plus any role skill found via case-insensitive includes() in topic or target_skill. This is a property about set membership.
  Classification: PROPERTY
  Test Strategy: Generate random items and role skill lists, verify chip inclusion rules hold.

2.4 Source experience resolved when matching
  Thoughts: For any item with a source_experience_id that exists in selected_experiences, the card should include the experience. This is an invariant about data linkage.
  Classification: PROPERTY
  Test Strategy: Generate items with IDs that match/don't match experiences, verify correct resolution.

2.5 Experience hidden when source_experience_id is null or unmatched
  Thoughts: Combined with 2.4 — it's the else branch of the same property.
  Classification: PROPERTY (merged with 2.4)

3.1 Maximum 3 StarCards rendered
  Thoughts: Same as 2.1.
  Classification: PROPERTY (merged with 2.1)

3.2 Card label reads "Expected Question N"
  Thoughts: For any card at index i, its label should be "Expected Question {i+1}". This is a formatting invariant.
  Classification: PROPERTY
  Test Strategy: For any set of cards, verify label matches 1-based index.

3.3–3.6 Visual rendering requirements
  Thoughts: These are about DOM structure/presence. Testable as examples with RTL. Not varying enough for PBT.
  Classification: EXAMPLE
  Test Strategy: Render with known data, assert expected elements present.

4.1 Computed at render time, not from speech events
  Thoughts: This is an architectural constraint. We can verify the component has no props related to speech text and useMemo depends only on analystOutput.
  Classification: EXAMPLE
  Test Strategy: Verify re-renders don't change output when analystOutput is stable.

4.2 Empty state when analystOutput null or plan empty
  Thoughts: Subsumed by the card count property (2.1) — when plan length is 0, cards = 0.
  Classification: PROPERTY (merged with 2.1)

5.1–5.6 Legacy removal
  Thoughts: These are codebase constraints about absence of code. Not runtime properties — they're verified by TypeScript compilation + grep.
  Classification: SMOKE
  Test Strategy: TypeScript builds without errors; grep for removed identifiers returns nothing.

5.7 callAgent3 continues to include analyst_output + transcript
  Thoughts: This is about the request payload structure. Testable as an example.
  Classification: EXAMPLE
  Test Strategy: Mock fetch, call callAgent3, assert request body has correct fields.

6.1–6.3 Panel visibility and PracticeBubbles unchanged
  Thoughts: These are non-regression constraints. Verified by existing tests passing.
  Classification: SMOKE
  Test Strategy: Existing test suite continues to pass.

7.1–7.5 Design theme compliance
  Thoughts: CSS styling rules. Not computationally testable as properties.
  Classification: EXAMPLE
  Test Strategy: Visual inspection or snapshot tests of rendered card styles.

8.1–8.3 Build integrity
  Thoughts: Build passes. This is a smoke test.
  Classification: SMOKE
  Test Strategy: Run `tsc --noEmit`, `vite build`, and `vitest run`.

### Property Reflection

Reviewing all identified properties:
- 2.1, 2.2, 3.1, 4.2 all relate to card count = min(plan.length, 3). **Consolidate into one property.**
- 2.4, 2.5 relate to experience resolution (present when ID matches, absent otherwise). **Consolidate into one property.**
- 1.2 and 1.3 are about the classification algorithm — 1.2 is the preprocessing step and 1.3 is the priority logic. They test different aspects, keep separate.
- 3.2 (label format) is unique and stands alone.
- 2.3 (keyword chips) is unique and stands alone.
- 1.4 (default fallback) is actually the complement of 1.3 — for 1.3 we test matched inputs return first match; for 1.4 we test unmatched inputs return default. **These could combine, but they test distinct behaviors — keep separate for clarity.**

Final properties: 6 distinct properties.


### Property 1: Classification uses lowercased concatenation

*For any* topic string and target_skill string, `classifyStarCategory(topic, targetSkill)` SHALL produce the same result as classifying the single string `(topic + " " + targetSkill).toLowerCase()` — i.e., the classification is case-insensitive and considers both fields together.

**Validates: Requirements 1.2**

### Property 2: First-match priority ordering

*For any* combined input string that contains trigger keywords belonging to categories at indices i and j (where i < j), `classifyStarCategory` SHALL return the category at index i (the higher-priority category).

**Validates: Requirements 1.3**

### Property 3: Default fallback for unmatched inputs

*For any* topic and target_skill whose lowercased concatenation contains none of the trigger keywords defined in any of the 8 STAR categories, `classifyStarCategory` SHALL return the default classification with label "General", elements [Situation, Task, Action, Result], and the default Korean reasoning string.

**Validates: Requirements 1.4**

### Property 4: Card count bounded by min(plan length, 3)

*For any* `analystOutput` with an `interview_plan` array of length N (where N ≥ 0), the GuidePanel SHALL derive exactly `min(N, 3)` StarCards. When `analystOutput` is null or `interview_plan` is absent, the card count SHALL be 0.

**Validates: Requirements 2.1, 2.2, 3.1, 4.2**

### Property 5: Keyword chips always include target_skill plus matching role skills

*For any* interview plan item and target_role with required/preferred skills lists, the derived keyword chips SHALL: (a) always contain the item's `target_skill` as the first element, and (b) contain every skill from required_skills or preferred_skills whose lowercase form is found (via `includes()`) in the lowercased `target_skill + " " + topic` string, with no duplicates.

**Validates: Requirements 2.3**

### Property 6: Experience resolution correctness

*For any* interview plan item, if `source_experience_id` is non-null and matches an entry in `selected_experiences`, the card's `relatedExperience` SHALL be `{ title, organization }` from that entry. If `source_experience_id` is null or matches no entry, `relatedExperience` SHALL be null.

**Validates: Requirements 2.4, 2.5**
