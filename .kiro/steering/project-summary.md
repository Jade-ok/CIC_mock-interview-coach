# Project Summary

> Active product and implementation summary. Last verified: 2026-08-07.

Build a voice-based résumé deep-dive mock interview app for students and internship candidates.

The user uploads a résumé, pastes a target job description, completes a spoken interview, and receives student-appropriate feedback.

The Analyst currently accepts internships, coursework, academic projects, personal projects, hackathons, and student clubs as selected experience types. The interview profile also intends to support research, volunteering, and part-time work, but the Analyst enum must be expanded before those types work end to end. The app should not expect senior-level system design, large-scale production ownership, formal management experience, or many years of professional work.

## Interview Format

The interview includes:

- 3 main questions
- 1 adaptive follow-up after each main question
- up to 6 spoken answers
- an option to end the interview early
- a Practice Mode UI with interviewer bubbles, competency guides, and keyword highlighting

The three interview areas are:

1. Project overview and personal contribution
2. Technical problem-solving and decision-making
3. Learning, collaboration, and role alignment

Each follow-up should be based on what the candidate actually said.

## Main Components

### Analyst Agent

The Analyst receives the full résumé and job description.

It returns only personalized candidate and role information, including:

- candidate background and level
- relevant skills
- target role requirements
- résumé-to-job alignment
- strongest experiences
- measurable claims
- areas worth clarifying
- analysis warnings

The Analyst does not control interview length, follow-up rules, tone, or difficulty.

### Amazon Nova 2 Sonic Interviewer

Nova Sonic conducts the spoken interview.

It receives:

- personalized candidate data from the Analyst
- the interview structure
- the student interview profile

Nova Sonic should:

- generate and speak the three main questions
- understand the candidate's spoken responses
- generate one adaptive follow-up per main question
- base each follow-up on the candidate's actual answer
- ask one concise question at a time
- remain supportive and professional
- accept student-level experiences
- provide both interviewer and candidate transcripts

The Nova system context defines the expected three-question/three-follow-up sequence. Explicit application-side tracking of the current point, main/follow-up stage, follow-up usage, and completion remains planned rather than implemented.

### Evaluator Agent

The Evaluator contract requires:

- the full question-and-answer transcript
- candidate level
- target role
- completion status
- number of completed main questions
- number of completed follow-ups
- whether the interview ended early

When invoked with a valid request, it generates:

- a score for each question across concrete example, situation/action/result, link to job, and quantifiable outcome
- four aggregated dimension scores and an overall score
- a readiness label
- strengths
- improvements
- contextual advice
- interview metadata passed through from the request

## Configuration Files in S3

### Interview Structure

The interview structure defines what the interview covers.

It should include:

- three interview points
- the objective of each point
- the type of experience to prioritize
- what Nova should listen for
- useful follow-up topics
- the maximum of one follow-up per point
- whether early stopping is allowed

### Student Interview Profile

The student profile defines how Nova should behave.

It should specify:

- supportive and professional tone
- clear and concise wording
- one question at a time
- low challenge frequency
- gentle requests for evidence
- no advanced constraints
- valid student experience types
- no expectation of senior-level experience
- no feedback during the interview
- no invented résumé details
- no multiple questions in one turn

Later, additional profiles can be added for standard and challenging interviews without changing the Analyst output or core interview structure.

## Interview Flow

The sequence is:

- main question
- main answer
- one adaptive follow-up
- follow-up answer
- move to the next interview point

The intended flow ends after the third follow-up answer and sends the mapped conversation to the Evaluator. The frontend now maps final transcript entries to `schemas/interviewer_output.json`; live end-to-end verification remains pending.

The implemented handoff marks an early-ended interview accordingly and scores only completed question-answer pairs, without penalizing omitted areas. Live deployed verification remains pending.

## AWS Services

The agreed deployment architecture uses one AWS account:

- AWS Amplify Hosting serves the React/Vite frontend.
- An authenticated browser session opens a secure `wss://` connection to Amazon Bedrock AgentCore Runtime. The browser does not invoke Bedrock directly or contain permanent AWS credentials.
- AgentCore runs the FastAPI/Python voice relay as a serverless managed container runtime. The relay owns only connection-scoped state and proxies the bidirectional stream to Amazon Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`).
- Four AWS Lambda functions handle PDF parsing, résumé analysis, Interviewer context building, and evaluation. Analyst and Evaluator invoke Claude Sonnet 4.6 through Amazon Bedrock; the Interviewer Lambda builds context from configuration without making a model call.
- Amazon S3 stores the interview structure and student interview profile configuration.
- AWS CDK defines the Lambda functions, their endpoints, permissions, and the S3 configuration deployment. AgentCore deployment remains a separate container workflow.

This is the target deployment plan, not the current end-to-end state. The frontend reads `VITE_VOICE_WS_URL` with a local `ws://localhost:8080/` fallback, and the adapter has focused unit coverage. A hosted AgentCore runtime, a paid live Nova conversation, Amplify Hosting, and browser-compatible authorization still require environment-specific configuration and end-to-end verification. The four Lambda Function URLs are currently public and must be protected before the application is shared publicly.

No database or permanent interview history is currently implemented. Practice Mode presentation is implemented locally; cross-session history is not.
