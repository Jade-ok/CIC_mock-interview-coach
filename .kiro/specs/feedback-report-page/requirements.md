# Requirements Document

> Maintained requirements. Last verified: 2026-08-07. The component is integrated into `FeedbackScreen`; deployment with the React app on Amplify Hosting remains pending.

## Introduction

The Feedback Report Page is a React component that renders the Evaluator agent's output as a student-friendly interview feedback report. It displays per-question scores, overall readiness assessment, qualitative feedback, and contextual advice.

The page follows the project's Midnight Green dark theme (defined in `.kiro/steering/design-theme.md`) and consumes data from the `evaluator_output.json` schema. The design references the attached mockup showing a single scrollable page with distinct sections for readiness label, dimension scores, strengths/improvements, contextual advice, and per-question breakdown.

## Glossary

- **Feedback_Report**: The JSON response from the Evaluator Lambda conforming to `schemas/evaluator_output.json`
- **Readiness_Label**: One of five categorical labels ("Interview ready", "Strong foundation", "Developing well", "Needs more practice", "Needs clearer examples")
- **Dimension_Score**: A per-dimension average (1.0-5.0) across all answered questions
- **Score_Bar**: A visual 5-segment bar chart showing a score out of 5
- **Question_Card**: A static card showing one Q&A pair with its 4 dimension scores

## Requirements

### Requirement 1: Page Layout and Theme

**User Story:** As a co-op student, I want the feedback page to match the rest of the app's dark theme, so the experience feels cohesive.

#### Acceptance Criteria

1. THE Feedback_Report page SHALL use the Midnight Green dark theme tokens from the project steering (background `#0A0A0A`, tile background `#1C1C1E`, text `#FFFFFF`, secondary text `#A0A0A5`)
2. THE page SHALL be a single vertically-scrollable layout with distinct visual sections
3. THE page SHALL use CSS variables for all theme colors, not hard-coded values
4. THE page SHALL use the system UI font stack as defined in the design theme
5. THE page SHALL include a sticky top header with "CIC Mock Interview Coach" branding and a "Practice again" action
6. THE page SHALL show "View full transcript" only after a transcript-view callback is implemented

### Requirement 2: Readiness Label Hero Section

**User Story:** As a co-op student, I want to immediately see my readiness level at the top, so I understand my overall standing at a glance.

#### Acceptance Criteria

1. THE hero section SHALL display the readiness_label as a large heading (e.g. "Developing well")
2. THE hero section SHALL display a supportive subheading that contextualizes the label for the student
3. THE hero section SHALL show the overall total score (e.g. "3.0 / 5 overall") and question count (e.g. "4 of 6 questions answered")
4. THE hero section SHALL display the interview context line "INTERVIEW FEEDBACK · {target_role}" using interview_metadata.target_role
5. THE readiness_label heading SHALL use a distinct visual style (large font, high contrast) to draw attention

### Requirement 3: Dimension Scores Section

**User Story:** As a co-op student, I want to see how I scored on each dimension, so I know which areas are strong and which need work.

#### Acceptance Criteria

1. THE dimension scores section SHALL display all four dimensions: concrete_example, star_structure, link_to_job, quantifiable_outcome
2. EACH dimension SHALL show a human-readable label (e.g. "Concrete example", "Situation → Action → Result", "Link to the job", "Quantifiable outcome")
3. EACH dimension SHALL show a brief explanation of what it measures (e.g. "Did you point to a real project or moment?")
4. EACH dimension SHALL display the numeric average score (1 decimal place) alongside a visual Score_Bar
5. THE Score_Bar SHALL be a 5-segment horizontal bar where filled segments represent the score and unfilled segments represent the gap
6. THE Score_Bar filled segments SHALL use the warning/accent color (`#FF5C5C` or similar) to create visual contrast on the dark background

### Requirement 4: Strengths and Improvements Section

**User Story:** As a co-op student, I want to see what I did well and what to work on, so I have clear takeaways.

#### Acceptance Criteria

1. THE page SHALL display a "What you did well" section with all items from the strengths array
2. THE page SHALL display a "What to work on next" section with all items from the improvements array
3. EACH strength item SHALL be rendered as a paragraph with supportive, student-friendly language
4. EACH improvement item SHALL be rendered as a bulleted list item with actionable advice
5. THE two sections SHALL be visually side-by-side on wide viewports and stacked on narrow viewports
6. Direct quotes from the transcript (appearing in strengths/improvements) SHALL be visually distinguished with quotation styling

### Requirement 5: Contextual Advice Section

**User Story:** As a co-op student, I want resume-specific advice for future interviews, so I can prepare better next time.

#### Acceptance Criteria

1. THE page SHALL display a "For your next interview" section with all items from the contextual_advice array
2. THE section SHALL include a subheading: "Advice based on your resume and the job you're aiming for."
3. EACH advice item SHALL be displayed as a numbered item with clear, readable formatting
4. THE section SHALL be visually separated from the strengths/improvements section above

### Requirement 6: Per-Question Breakdown Section

**User Story:** As a co-op student, I want to see how each individual answer scored, so I can identify which specific responses need improvement.

#### Acceptance Criteria

1. THE page SHALL display a "Question by question" section listing all scored questions
2. THE section SHALL include an intro line: "You answered {question_count} of 6 questions — you're scored only on what you answered, so ending early never counts against you."
3. EACH Question_Card SHALL display: the question number, turn type badge ("Main question" or "Follow-up"), the question text, and a brief answer summary
4. EACH Question_Card SHALL display four Score_Bars (one per dimension) showing that question's individual scores
5. THE turn type badge SHALL visually distinguish main questions from follow-ups (different background color or border)
6. THE questions SHALL be displayed in conversation order (matching the conversation array order)

### Requirement 7: Footer Section

**User Story:** As a co-op student, I want an encouraging closing message and actions to continue, so I feel motivated to keep practicing.

#### Acceptance Criteria

1. THE page SHALL end with an encouraging motivational message (e.g. "Every practice round makes the real one easier.")
2. THE footer SHALL include "Practice again" and SHALL include "View full transcript" only when a transcript-view callback is available
3. THE footer SHALL use the accent color background to visually anchor the page bottom
4. THE "Practice again" button SHALL be the primary action (filled button style)
5. WHEN shown, THE "View full transcript" button SHALL be a secondary action (outlined button style)

### Requirement 8: Data Consumption

**User Story:** As a developer, I want the component to correctly consume the Evaluator output schema, so the UI always matches the backend contract.

#### Acceptance Criteria

1. THE component SHALL accept a prop of type `EvaluatorOutput` matching the `schemas/evaluator_output.json` structure
2. THE component SHALL handle variable question_count (1 to 6) gracefully, rendering only the questions present
3. THE component SHALL display dimension labels in human-readable form (snake_case → Title Case with appropriate labels)
4. THE component SHALL format numeric scores to one decimal place for averages and integer for per-question scores
5. IF the readiness_label is "Interview ready" or "Strong foundation", THEN the hero section SHALL use a positive tone indicator
6. IF the readiness_label is "Needs more practice" or "Needs clearer examples", THEN the hero section SHALL use an encouraging but growth-focused tone indicator

### Requirement 9: Responsive Design

**User Story:** As a co-op student, I want to read my feedback on any device, so I can review it on my phone or laptop.

#### Acceptance Criteria

1. THE page layout SHALL be responsive, working on viewports from 375px (mobile) to 1440px (desktop)
2. ON mobile viewports, THE dimension scores SHALL stack vertically (one per row)
3. ON desktop viewports, THE dimension scores SHALL display in a 2x2 grid
4. ON mobile viewports, THE strengths and improvements sections SHALL stack vertically
5. ON desktop viewports, THE strengths and improvements sections SHALL display side-by-side
6. THE font sizes SHALL scale appropriately between mobile and desktop breakpoints
