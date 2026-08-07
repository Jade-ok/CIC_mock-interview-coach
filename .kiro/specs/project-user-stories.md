# User Stories — Mock Interview Coach (Project-Wide)

> Maintained product stories. Last verified against current contracts and the target AWS deployment plan: 2026-08-07. Amplify hosting and authenticated voice access are planned, not yet implemented.

Covers the full candidate journey across every component in the architecture: an Amplify-hosted React client → `pdf_parser` → `analyst` → `interviewer` → authenticated WSS to the AgentCore voice relay → Nova 2 Sonic (live interview) → `evaluator`, plus cross-cutting platform behavior. CDK manages the Lambda/S3 backend infrastructure; AgentCore deployment remains a separate workflow.

Module-level requirements (acceptance criteria, error handling, etc.) for the Interviewer Lambda are defined separately in `.kiro/specs/interviewer-agent/requirements.md`.

## Epic 1: Upload & Parsing (`frontend` + `pdf_parser`)

- **US-1.1** As a candidate, I want to upload my résumé as a PDF, so that I don't have to retype my background.
- **US-1.2** As a candidate, I want to paste or upload a target job description, so that the interview is tailored to that specific role.
- **US-1.3** As a candidate, I want the client and PDF Parser to enforce one consistent résumé limit, so that I get instant feedback instead of a failed upload. Current gap: the client permits 10 MB while the PDF Parser rejects decoded files over 4 MB.
- **US-1.4** As a candidate, I want a clear error if my PDF can't be parsed, so that I know to re-upload rather than sit on a silent failure.

## Epic 2: Candidate Analysis (`analyst`)

- **US-2.1** As a candidate, I want my strongest, most relevant experiences identified from my résumé, so that the interview focuses on what I can actually speak to.
- **US-2.2** As a candidate, I want internships, coursework, personal projects, hackathons, and club work recognized as valid experience, so that I'm not penalized for lacking traditional job history.
- **US-2.3** As a candidate, I want vague or unsupported résumé claims flagged internally, so that the interview can gently probe them instead of taking them at face value.

## Epic 3: Interview Setup (`interviewer`)

- **US-3.1** As a candidate, I want the system to prepare a personalized interview plan from my analysis, so that questions feel relevant to me rather than generic.
- **US-3.2** As a candidate, I want the interview structure (3 areas, 1 follow-up each) to be consistent, so that I know what to expect before I start.

## Epic 4: Live Spoken Interview (`frontend` + AgentCore + Nova 2 Sonic)

- **US-4.1** As a candidate, I want to answer questions by speaking naturally, so that the practice feels like a real interview.
- **US-4.2** As a candidate, I want to be asked about project ownership, technical problem-solving, and collaboration/role fit, so that I practice the three areas that actually get evaluated.
- **US-4.3** As a candidate, I want one adaptive follow-up per question based on what I actually said, so that the conversation feels responsive, not scripted.
- **US-4.4** As a candidate, I want only one clear question asked at a time, so that I'm never confused about what to answer.
- **US-4.5** As a candidate, I want the interviewer to stay supportive, professional, and never invent facts about my background, so that I feel safe practicing.
- **US-4.6** As a candidate, I want no scoring or feedback during the interview itself, so that I can focus on answering instead of second-guessing live.

## Epic 5: Evaluation & Feedback (`evaluator`)

- **US-5.1** As a candidate, I want an overall readiness assessment after the interview, so that I know roughly where I stand for this role.
- **US-5.2** As a candidate, I want scores for concrete examples, situation/action/result structure, link to the job, and quantifiable outcomes, so that I know exactly what to work on.
- **US-5.3** As a candidate, I want question-by-question summaries plus strengths and improvements, so that I get concrete, actionable takeaways.
- **US-5.4** As a candidate, I want contextual advice tied to my résumé and target role, so that I leave with a plan, not just a score.
- **US-5.5** As a candidate who ends early, I want to be scored only on what I covered, without penalty for skipped areas, so that a partial session still feels fair.

## Epic 6: Cross-Cutting / Platform

- **US-6.1** As a candidate, I want the app to treat me as a student/intern-level candidate rather than expect senior scope, so that the bar matches where I actually am.
- **US-6.2** As a candidate, I want a friendly error message and retry option if any step fails (upload, analysis, interview setup, evaluation), so that a transient backend hiccup doesn't end my session.
- **US-6.3** As a candidate, I want no permanent interview record, so that I can practice without creating stored history (v1 has no database; AgentCore holds only transient voice-stream state). The planned authentication layer protects backend access and does not imply stored interview history.
- **US-6.4** As a candidate, I want to repeat the same interview flow across multiple attempts, so that I can practice again without needing an account.
- **US-6.5** As an operator, I want the public Amplify client to use authenticated WSS when opening AgentCore sessions, so that Nova access is not exposed through anonymous direct browser credentials.
