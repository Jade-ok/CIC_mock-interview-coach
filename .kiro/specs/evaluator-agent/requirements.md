# Requirements Document

## Introduction

The Evaluator Agent is the third and final agent in the CIC Mock Interview Coach pipeline. After the Interviewer agent completes a turn-based interview session, the Evaluator receives the full interview transcript along with the resume analysis and job description. It generates a scored feedback report assessing the student's interview performance across four fixed dimensions, provides an overall readiness label, and delivers actionable feedback with contextual advice.

The Interviewer is designed to ask 3 main questions, each followed by exactly 1 follow-up question, for a maximum of 6 questions total in a complete interview. However, the student may stop the conversation at any time, so the transcript can contain anywhere from 1 to 6 question-answer pairs. The Evaluator must handle any transcript length and score only the questions that were actually answered.

This entire system is calibrated for co-op seeking students, not experienced professionals. All scoring rubrics, feedback tone, and expectations are set at a level appropriate for students pursuing co-op placements. School projects, course work, hackathons, and team assignments are considered valid experience.

The Evaluator is invoked exactly once per interview session and operates as a stateless AWS Lambda function using the Bedrock Converse API with tool_use.

## Glossary

- **Evaluator**: The AWS Lambda function that scores and provides feedback on a completed mock interview
- **Transcript**: The complete conversation history from the Interviewer agent, containing between 1 and 6 question-answer pairs (3 main questions each with 1 follow-up at maximum)
- **Main_Question**: One of up to 3 primary interview questions asked by the Interviewer
- **Follow_Up_Question**: A single follow-up question paired with each main question to probe deeper into the student's answer
- **Resume_Analysis**: The output from the Analyst agent containing 4-6 extracted interview topics and key experiences from the student's resume
- **Job_Description**: The original job posting text provided by the student
- **Scoring_Dimension**: One of four fixed criteria used to evaluate each interview answer (concrete_example, situation_action_result, link_to_job, quantifiable_outcome)
- **Readiness_Label**: A categorical assessment of the student's overall interview preparedness
- **Feedback_Report**: The structured JSON output containing all scores, labels, and feedback
- **Bedrock_Client**: The module responsible for calling the AWS Bedrock Converse API
- **Orchestrator**: The module that coordinates validation, prompt building, API calls, and response parsing
- **Tool_Use**: The Bedrock Converse API pattern that forces the LLM to return structured JSON via a defined tool schema

## Requirements

### Requirement 1: Input Validation

**User Story:** As a system operator, I want the Evaluator to validate all inputs before processing, so that malformed or incomplete data is rejected early with clear error messages.

#### Acceptance Criteria

1. WHEN the Evaluator receives a request, THE Evaluator SHALL validate that the transcript, resume_analysis, and job_description fields are all present and non-empty
2. WHEN the transcript contains fewer than one question-answer pair, THE Evaluator SHALL reject the input with a descriptive error message
3. WHEN the transcript contains more than 6 question-answer pairs, THE Evaluator SHALL reject the input with a descriptive error message indicating the transcript exceeds the expected interview length
4. IF any required field is missing or empty, THEN THE Evaluator SHALL return an error response with a 400 status code and a message identifying the missing field
5. WHEN the Evaluator receives a valid request via Function URL, THE Evaluator SHALL parse the JSON payload from the event body field
6. THE Evaluator SHALL accept transcripts of any length between 1 and 6 question-answer pairs inclusive, supporting early termination by the student

### Requirement 2: Prompt Construction

**User Story:** As a developer, I want the Evaluator to construct a well-structured prompt for the LLM, so that the model produces consistent and accurate scoring calibrated for co-op students.

#### Acceptance Criteria

1. WHEN building the evaluation prompt, THE Prompt_Builder SHALL include the full transcript, resume analysis, and job description as context
2. WHEN building the evaluation prompt, THE Prompt_Builder SHALL specify all four Scoring_Dimensions with their definitions
3. WHEN building the evaluation prompt, THE Prompt_Builder SHALL instruct the LLM to score each dimension on a 1-5 integer scale
4. WHEN building the evaluation prompt, THE Prompt_Builder SHALL instruct the LLM to provide the scoring judgment only, without calculating aggregate scores or classification labels
5. THE Prompt_Builder SHALL set the tone directive to supportive, constructive, and student-friendly language
6. THE Prompt_Builder SHALL explicitly instruct the LLM that scoring expectations are calibrated for a co-op seeking student, not an experienced professional
7. THE Prompt_Builder SHALL instruct the LLM that school projects, course work, hackathons, and team assignments count as valid experience when scoring
8. THE Prompt_Builder SHALL instruct the LLM to score only the question-answer pairs present in the transcript, without penalizing the student for an incomplete interview

### Requirement 3: Bedrock API Invocation

**User Story:** As a developer, I want the Evaluator to reliably call the Bedrock Converse API, so that evaluation results are generated consistently.

#### Acceptance Criteria

1. THE Bedrock_Client SHALL call the Converse API using model ID global.anthropic.claude-fable-5 in region us-west-2
2. THE Bedrock_Client SHALL use the tool_use pattern to force structured JSON output matching the defined evaluation schema
3. IF the Bedrock API call fails or returns an invalid response, THEN THE Bedrock_Client SHALL retry the call once for a maximum of two total attempts
4. IF both attempts fail, THEN THE Bedrock_Client SHALL return an error response with a 500 status code and a descriptive error message

### Requirement 4: Per-Question Scoring

**User Story:** As a co-op student, I want each of my interview answers scored on specific criteria, so that I understand exactly where each answer was strong or weak.

#### Acceptance Criteria

1. WHEN the LLM returns scoring judgments, THE Evaluator SHALL produce a score object for each question-answer pair present in the transcript, regardless of whether the interview was completed in full
2. THE Evaluator SHALL include scores for all four dimensions per question: concrete_example, situation_action_result, link_to_job, and quantifiable_outcome
3. THE Evaluator SHALL constrain each dimension score to an integer between 1 and 5 inclusive
4. IF the LLM returns a score outside the 1-5 range, THEN THE Evaluator SHALL clamp the value to the nearest boundary (1 or 5)
5. THE Evaluator SHALL score each answer against co-op student expectations, recognizing school projects, course work, hackathons, and team assignments as valid experience

### Requirement 5: Overall Score Aggregation

**User Story:** As a co-op student, I want an overall summary of my performance, so that I can quickly understand my general interview readiness.

#### Acceptance Criteria

1. WHEN per-question scores are available, THE Evaluator SHALL calculate overall scores by averaging each dimension across all questions that were actually answered
2. THE Evaluator SHALL round overall dimension averages to one decimal place
3. THE Evaluator SHALL calculate a total overall score as the average of the four dimension averages, rounded to one decimal place
4. THE Evaluator SHALL NOT penalize the student for having fewer than 6 questions; averages are computed only over the questions present in the transcript

### Requirement 6: Readiness Label Classification

**User Story:** As a co-op student, I want a clear readiness label, so that I know where I stand without interpreting raw numbers.

#### Acceptance Criteria

1. WHEN the total overall score is calculated, THE Evaluator SHALL assign a Readiness_Label based on the following thresholds on the 1-5 scale: 4.3-5.0 maps to "Interview ready", 3.5-4.2 maps to "Strong foundation", 2.8-3.4 maps to "Developing well", 2.0-2.7 maps to "Needs more practice", 1.0-1.9 maps to "Needs clearer examples"
2. THE Evaluator SHALL assign exactly one Readiness_Label per evaluation
3. THE Evaluator SHALL compute the Readiness_Label deterministically in Python code, not via LLM judgment

### Requirement 7: Qualitative Feedback Generation

**User Story:** As a co-op student, I want specific praise and actionable improvement advice, so that I know what to keep doing and what to change.

#### Acceptance Criteria

1. WHEN generating feedback, THE Evaluator SHALL produce a "what you did well" section containing specific praise with direct quotes or references from the transcript
2. WHEN generating feedback, THE Evaluator SHALL produce a "what to improve" section containing specific, actionable advice tied to the scoring dimensions
3. THE Evaluator SHALL ensure all feedback uses supportive, constructive, student-friendly language appropriate for co-op seeking students
4. THE Evaluator SHALL frame all feedback in terms of co-op student expectations, acknowledging that academic and extracurricular experiences are valid and valued

### Requirement 8: Contextual Advice

**User Story:** As a co-op student, I want advice that considers my full resume and the target job, so that I can leverage my best experiences in future interviews.

#### Acceptance Criteria

1. WHEN the resume_analysis contains experiences relevant to a question that the student did not mention, THE Evaluator SHALL suggest using that specific experience in future interviews
2. WHEN the job_description requires a competency that was not addressed during the interview, THE Evaluator SHALL flag that competency gap with a specific recommendation
3. THE Evaluator SHALL reference specific content from the resume_analysis and job_description when providing contextual advice
4. THE Evaluator SHALL frame contextual advice in the context of a co-op student building their career, not an experienced professional

### Requirement 9: Response Structure

**User Story:** As a frontend developer, I want the Evaluator to return a well-structured JSON response, so that the browser can easily render the feedback report.

#### Acceptance Criteria

1. THE Evaluator SHALL return the Feedback_Report as a JSON object containing: per_question_scores, overall_scores, readiness_label, strengths, improvements, and contextual_advice fields
2. WHEN the evaluation succeeds, THE Evaluator SHALL return an HTTP 200 response with the Feedback_Report as the response body
3. THE Evaluator SHALL ensure the per_question_scores field is an array with one entry per question actually answered, each containing the question text, student answer summary, and four dimension scores (each 1-5)
4. THE Evaluator SHALL ensure the overall_scores field contains the four dimension averages and the total overall score, all on the 1-5 scale
5. THE Evaluator SHALL include a question_count field indicating how many questions were scored out of the maximum 6

### Requirement 10: Error Handling

**User Story:** As a system operator, I want the Evaluator to handle errors gracefully, so that failures produce useful diagnostic information.

#### Acceptance Criteria

1. IF an unexpected error occurs during evaluation, THEN THE Evaluator SHALL return a 500 status code with a JSON error response containing an error type and descriptive message
2. IF the LLM response does not conform to the expected tool_use schema, THEN THE Evaluator SHALL attempt to parse partial results and retry once before returning an error
3. THE Evaluator SHALL log all errors with sufficient context for debugging without exposing sensitive student data in error responses
