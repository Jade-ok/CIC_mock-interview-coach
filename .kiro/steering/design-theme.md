# Design Theme

Use a dark video-conference interface inspired by Zoom. The theme name is **Midnight Green**.

## Color Tokens

| Purpose | Value | Notes |
|---|---|---|
| Canvas background | `#0A0A0A` | Near-black page background |
| Participant tile | `#1C1C1E` | Video and waveform surfaces |
| Control bar | `#2C2C2E` | Slightly lighter than the canvas |
| Primary text | `#FFFFFF` | Names, timer, and primary labels |
| Secondary text | `#A0A0A5` | Inactive labels and timestamps |
| Active speaker | `#9AE05C` | Border and waveform accent |
| Error and end action | `#FF5C5C` | Error states and destructive action |
| Guide highlight | `#4A9EFF` | Competency highlights |

## Typography

- Use the system UI font stack: San Francisco, Segoe UI, Roboto, then sans-serif.
- Participant labels use 14 px medium-weight text on a translucent dark badge.
- Timer and status text use 13 px regular text with the secondary color.

## Layout

- Use participant tiles with an 8 px corner radius and compact spacing.
- Keep the control bar fixed at the bottom with evenly spaced centered controls.
- Use a 2–3 px active-speaker border with `#9AE05C`.

## Implementation Rules

- Define and reuse CSS variables for these tokens.
- Do not introduce a separate light theme for new screens.
- Literal fallback values are allowed only when they match the canonical tokens.
- The main app and FeedbackReport currently use different token namespaces; consolidate them during a dedicated styling refactor.
- Use this file as the visual source of truth until a canonical reference screenshot is committed.
