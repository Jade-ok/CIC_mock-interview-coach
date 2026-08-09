# Requirements Document

> Superseded historical specification. The English translations and microphone-remediation work were incorporated, but the predictive-card requirements were replaced by `../guide-panel-v2/requirements.md`.

## Introduction

This feature covers five related UX improvements to the interview screen: translating Korean text to English in the Guide Panel, adding descriptive section labels to STAR cards, unifying accent colors to neon green, fixing the microphone-denied error flow, and improving vertical layout spacing for participant tiles and the mic button.

## Glossary

- **Guide_Panel**: The right-side panel in the interview screen that displays STAR-method preparation cards derived from Analyst output (`GuidePanel.tsx`).
- **STAR_Card**: A single card within the Guide Panel showing predicted topic, keyword chips, category, element badges, reasoning, and optional related experience.
- **Star_Category_Matcher**: The utility module (`starCategoryMatcher.ts`) containing the `STAR_CATEGORIES` array and classification logic.
- **Interview_Screen**: The main interview view component (`InterviewScreen.tsx`) containing participant tiles, mic button, control bar, and Guide Panel.
- **User_Tile**: The participant tile representing the user/candidate within the interview screen.
- **Participant_Tiles**: The container component rendering AI tile and User tile vertically.
- **Mic_Button**: The click-toggle microphone recording button displayed below the participant tiles.
- **Accent_Color**: The application's primary accent color `#9AE05C` (neon green), used for active-speaker borders and waveform indicators.

## Requirements

### Requirement 1: English-Only Guide Panel Text

**User Story:** As a user, I want all Guide Panel text to be in English, so that the interface is consistent and understandable for English-speaking candidates.

#### Acceptance Criteria

1. THE Star_Category_Matcher SHALL define all `reasoning` string values in the `STAR_CATEGORIES` array in English only.
2. THE Star_Category_Matcher SHALL define the `DEFAULT_CLASSIFICATION.reasoning` value in English only.
3. THE Guide_Panel SHALL render STAR card labels as "Expected Question N" where N is the card index (1, 2, or 3).
4. WHEN the Guide_Panel renders any STAR card, THE Guide_Panel SHALL display zero Korean characters in any visible text content.
5. FOR ALL entries in `STAR_CATEGORIES`, translating the reasoning field to English then classifying any topic SHALL produce the same `StarClassification` structure (round-trip: label and starElements unchanged, only reasoning text differs in language).

### Requirement 2: Descriptive Section Labels on STAR Cards

**User Story:** As a user, I want small descriptive labels above each section of a STAR card, so that I understand what each piece of information represents at a glance.

#### Acceptance Criteria

1. THE Guide_Panel SHALL render the label "Question focus:" above the topic text in each STAR card.
2. THE Guide_Panel SHALL render the label "Skills to highlight:" above the keyword chips section in each STAR card.
3. THE Guide_Panel SHALL render the label "Question type:" above the category label in each STAR card.
4. THE Guide_Panel SHALL render the label "Emphasize in your answer:" above the starElements badges in each STAR card.
5. WHEN a STAR card has a related experience, THE Guide_Panel SHALL render the label "Relevant experience:" above the experience section.
6. WHEN a STAR card has no related experience, THE Guide_Panel SHALL NOT render the "Relevant experience:" label.
7. THE Guide_Panel SHALL style all descriptive labels at 11px font size with the secondary text color (`#A0A0A5`), visually subordinate to the content they describe.

### Requirement 3: Green Accent Color Unification in Guide Panel

**User Story:** As a user, I want the Guide Panel to use the same neon green accent color as the rest of the interface, so that the visual design feels cohesive.

#### Acceptance Criteria

1. THE Guide_Panel SHALL render the "Expected Question N" label text using the accent color (`#9AE05C`) instead of blue (`#4A9EFF`).
2. THE Guide_Panel SHALL render element badge text and background using the accent color (`#9AE05C` text, `rgba(154, 224, 92, 0.12)` background) instead of blue variants.
3. THE Guide_Panel SHALL contain zero references to `#4A9EFF` or `--color-guide-highlight` in its style block.
4. THE Guide_Panel SHALL use `var(--color-accent, #9AE05C)` for all accent-colored elements.

### Requirement 4: Microphone Permission Denied — Updated Message and Removed Text Mode UI

**User Story:** As a user whose microphone permission was denied, I want a clear message telling me how to fix it, so that I know what action to take instead of seeing a confusing "text mode" fallback.

#### Acceptance Criteria

1. WHEN the microphone permission is denied, THE Interview_Screen SHALL display the error message: "Microphone access is required. Please allow microphone permission in your browser settings and refresh the page."
2. THE User_Tile SHALL NOT render a "(Text Mode)" suffix in its label under any condition.
3. THE User_Tile SHALL NOT render the keyboard icon (⌨️) under any condition.
4. THE User_Tile SHALL NOT accept a `textOnly` prop.
5. THE Participant_Tiles SHALL NOT accept a `textOnly` prop.
6. THE Interview_Screen SHALL retain the `state.inputMode` field in the session reducer for mic-gating logic.
7. IF the microphone permission is denied, THEN THE Interview_Screen SHALL display the error banner with role="alert" for accessibility.

### Requirement 5: Vertical Layout — Tile Height and Mic Button Spacing

**User Story:** As a user, I want the participant tiles and mic button to be evenly distributed vertically, so that the interview screen looks balanced without excessive empty space.

#### Acceptance Criteria

1. THE Interview_Screen SHALL distribute the AI tile, User tile, and Mic button with visually even vertical spacing within the left panel.
2. THE Participant_Tiles container SHALL allow tiles to expand and fill available vertical space proportionally.
3. THE Interview_Screen SHALL reduce the gap between the User tile bottom edge and the Mic button top edge compared to the current layout (max 24px padding above mic button wrapper, reduced from current value).
4. WHILE the practice mode is active, THE Interview_Screen left panel SHALL maintain even vertical distribution despite the narrower width.
5. THE Interview_Screen SHALL NOT introduce a fixed pixel height on participant tiles that prevents responsive scaling on different viewport sizes.
