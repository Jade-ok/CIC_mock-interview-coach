# Requirements Document

## Introduction

The Interviewer Agent is a turn-based mock interview Lambda that asks one behavioral question per turn, scores the student's answer against a 4-dimension rubric, and deterministically decides whether to ask a follow-up or advance to the next topic. It receives interview points (from the Analyst agent), the student's latest answer, and the current interview state. It returns rubric scores, a decision, and an updated state. The Lambda is stateless; the browser manages all session state.

## Glossary

- **Interviewer_Lambda**: The AWS Lambda function (Python 3.12) that implements the interviewer agent logic
- **Bedrock_Client**: The module that calls Amazon Bedrock Converse API using Claude Opus 4 in tool_use mode
- **Interview_State**: An object containing conversation_history, current_point_index, and follow_up_count
- **Interview_Points**: The full list of interview topics produced by the Analyst agent (max 10 items)
- **Rubric_Judgment**: A set of 4 boolean scores evaluating a student answer (concrete_example, situation_action_result, link_to_job, quantifiable_outcome)
- **Decision**: One of four values: next_point, follow_up, complete, or error
- **Orchestrator**: The module containing business logic including deterministic decision calculation
- **Validator**: The module responsible for input validation
- **Parser**: The module that extracts and validates Claude's tool_use response
- **Prompt_Builder**: The module that constructs the system prompt and messages for Claude

## Requirements

### Requirement 1: Single Question Generation

**User Story:** As a student, I want to receive one clear question per turn, so that I can focus my answer on a single topic.

#### Acceptance Criteria

1. WHEN the Interviewer_Lambda generates a question, THE Prompt_Builder SHALL instruct Claude to produce exactly one question per response
2. WHEN Claude returns a tool_use response with next_question exceeding 300 characters, THEN THE Parser SHALL return an error decision
3. THE Prompt_Builder SHALL instruct Claude to omit preamble, greetings, and small talk from questions
4. THE Prompt_Builder SHALL instruct Claude to produce a single, non-compound question (no multi-part questions joined by "and", "or", or multiple question marks)

### Requirement 2: Rubric Scoring via Claude

**User Story:** As a student, I want my answer scored on 4 behavioral dimensions, so that I receive structured feedback.

#### Acceptance Criteria

1. WHEN a non-empty student_answer is provided, THE Bedrock_Client SHALL send the conversation_history, the current interview point, and the student_answer to Claude Opus 4 via the Bedrock Converse API in tool_use mode
2. THE Prompt_Builder SHALL define a tool schema with exactly 4 boolean fields: concrete_example, situation_action_result, link_to_job, and quantifiable_outcome, plus a next_question string field with a maximum length of 300 characters
3. WHEN Claude returns a tool_use response, THE Parser SHALL extract the 4 boolean rubric scores and next_question from the response
4. IF Claude returns a response that does not contain a tool_use block, or the tool_use block is missing any of the 5 required fields, or any field has an incorrect type, THEN THE Parser SHALL return an error decision
5. IF the Bedrock Converse API call fails due to a service error, timeout, or throttling, THEN THE Bedrock_Client SHALL return an error decision with a message indicating the nature of the failure

### Requirement 3: Deterministic Decision Logic

**User Story:** As a developer, I want decision logic computed in Python (not by Claude), so that interview flow is predictable and testable.

#### Acceptance Criteria

1. WHEN 3 or more rubric booleans are true AND current_point_index is less than the last index in interview_points, THE Orchestrator SHALL set decision to "next_point"
2. WHEN 3 or more rubric booleans are true AND current_point_index equals the last index in interview_points, THE Orchestrator SHALL set decision to "complete"
3. WHEN fewer than 3 rubric booleans are true AND follow_up_count is less than 2, THE Orchestrator SHALL set decision to "follow_up"
4. WHEN fewer than 3 rubric booleans are true AND follow_up_count is 2 or greater AND current_point_index is less than the last index in interview_points, THE Orchestrator SHALL set decision to "next_point"
5. WHEN fewer than 3 rubric booleans are true AND follow_up_count is 2 or greater AND current_point_index equals the last index in interview_points, THE Orchestrator SHALL set decision to "complete"
6. THE Orchestrator decision function SHALL be a pure function that accepts exactly 4 parameters (rubric_judgment as a list of exactly 4 booleans, current_point_index as an integer from 0 to 9, follow_up_count as an integer from 0 to 2, and interview_points length as an integer from 1 to 10) and SHALL return one of exactly three string values: "next_point", "follow_up", or "complete"
7. IF rubric_judgment does not contain exactly 4 boolean values, THEN THE Orchestrator decision function SHALL raise a validation error indicating the expected input format
8. IF current_point_index is negative or greater than or equal to the length of interview_points, THEN THE Orchestrator decision function SHALL raise a validation error indicating the index is out of bounds

### Requirement 4: Interview State Management

**User Story:** As a frontend developer, I want the Lambda to return an updated interview state, so that the browser can pass it back on the next turn.

#### Acceptance Criteria

1. WHEN decision is next_point, THE Orchestrator SHALL increment current_point_index by 1 and reset follow_up_count to 0
2. WHEN decision is follow_up, THE Orchestrator SHALL increment follow_up_count by 1 and keep current_point_index unchanged
3. WHEN decision is complete, THE Orchestrator SHALL keep current_point_index and follow_up_count unchanged
4. IF decision is error, THEN THE Orchestrator SHALL keep current_point_index, follow_up_count, and conversation_history unchanged from the input state
5. WHEN the Orchestrator produces an updated state, THE Orchestrator SHALL append a turn object containing student_answer, rubric_judgment (which may be null), and the question asked to the end of conversation_history
6. WHEN student_answer is empty AND conversation_history is not empty, THE Orchestrator SHALL not append a turn object to conversation_history

### Requirement 5: Input Validation

**User Story:** As a developer, I want invalid inputs rejected early, so that the Lambda does not produce undefined behavior.

#### Acceptance Criteria

1. IF current_point_index is less than 0 or greater than or equal to the length of interview_points, THEN THE Validator SHALL return an error decision with a message indicating the index is out of bounds
2. IF follow_up_count is less than 0 or greater than 2, THEN THE Validator SHALL return an error decision with a message indicating follow_up_count is outside the allowed range of 0 to 2
3. IF interview_points is empty or missing, THEN THE Validator SHALL return an error decision with a message indicating interview_points is required and must be non-empty
4. IF interview_points contains more than 10 items, THEN THE Validator SHALL return an error decision with a message indicating the list exceeds the 10-item maximum
5. IF any required field (interview_points, student_answer, or interview_state containing conversation_history, current_point_index, and follow_up_count) is absent from the input, THEN THE Validator SHALL return an error decision with a message indicating which field is missing
6. IF student_answer is not a string, THEN THE Validator SHALL return an error decision with a message indicating the expected type
7. IF any item in interview_points is not a string, THEN THE Validator SHALL return an error decision with a message indicating which item has an invalid type

### Requirement 6: First Turn Handling

**User Story:** As a student, I want the interview to start with a question without requiring me to say anything first, so that the experience feels natural.

#### Acceptance Criteria

1. WHEN conversation_history is empty (length 0) AND student_answer is empty (empty string, null, or missing), THE Orchestrator SHALL generate the opening question from the first item in interview_points without calling the Bedrock_Client
2. WHEN conversation_history is empty AND student_answer is empty, THE Interviewer_Lambda SHALL return judgment as null, decision as follow_up, follow_up_count as 0, and interview_complete as false
3. WHEN conversation_history is empty AND student_answer is empty, THE Interviewer_Lambda SHALL return a next_question that references the topic in interview_points[0] and is at most 300 characters in length
4. WHEN conversation_history is empty AND student_answer is empty, THE Orchestrator SHALL return an updated interview_state with conversation_history containing a single entry recording the opening question, judgment as null, and student_answer as empty

### Requirement 7: Empty Answer Handling

**User Story:** As a student, I want the system to re-ask the question if I submit an empty answer mid-interview, so that I am not penalized for accidental submissions.

#### Acceptance Criteria

1. WHEN student_answer is empty (empty string, whitespace-only, or null/missing) AND conversation_history is not empty, THE Orchestrator SHALL return the last next_question stored in conversation_history without calling Bedrock
2. WHEN student_answer is empty AND conversation_history is not empty, THE Interviewer_Lambda SHALL return judgment as null, decision as follow_up, and interview_complete as false
3. WHEN student_answer is empty AND conversation_history is not empty, THE Orchestrator SHALL NOT append any entry to conversation_history and SHALL NOT modify current_point_index or follow_up_count

### Requirement 8: Termination Guarantee

**User Story:** As a developer, I want guaranteed termination of the interview session, so that the system cannot loop indefinitely.

#### Acceptance Criteria

1. THE Orchestrator SHALL enforce a maximum of 2 follow-ups per interview point by setting decision to next_point or complete when follow_up_count reaches 2, regardless of rubric scores
2. THE Validator SHALL reject interview_points containing more than 10 items by returning an error decision
3. THE Orchestrator SHALL guarantee that for any valid interview session (passing all input validation), the total number of scoring turns does not exceed 30, where a scoring turn is defined as a turn in which the student provides a non-empty answer and rubric judgment is produced
4. WHEN student_answer is empty AND the question is re-asked, THE Orchestrator SHALL NOT count the re-ask toward the per-point follow-up limit or the session turn total

### Requirement 9: Lambda Entry Point

**User Story:** As a deployer, I want the Lambda handler to parse the Function URL event and return a well-formed response, so that the frontend can consume results directly.

#### Acceptance Criteria

1. WHEN invoked via Function URL, THE Interviewer_Lambda SHALL parse the request body from event['body'] as JSON
2. IF event['body'] is missing, null, or not valid JSON, THEN THE Interviewer_Lambda SHALL return a response with statusCode 400, and a JSON body containing decision set to error, judgment set to null, next_question set to an empty string, interview_complete set to false, interview_state set to null, and an error_message indicating the request body is malformed
3. WHEN the request is successfully processed, THE Interviewer_Lambda SHALL return a response with statusCode 200 and a JSON body containing judgment, decision, next_question, interview_complete, and updated interview_state
4. THE Interviewer_Lambda SHALL set interview_complete to true when decision equals complete, and to false otherwise
5. IF an unhandled exception occurs, THEN THE Interviewer_Lambda SHALL return a response with statusCode 500, and a JSON body containing decision set to error, judgment set to null, next_question set to an empty string, interview_complete set to false, interview_state set to null, and an error_message indicating the nature of the failure
6. THE Interviewer_Lambda SHALL return all responses as an object with statusCode (integer) and body (JSON-encoded string) fields conforming to the Function URL response format

### Requirement 10: Bedrock Client Configuration

**User Story:** As a developer, I want Bedrock calls configured correctly, so that the interviewer uses the designated model and region.

#### Acceptance Criteria

1. THE Bedrock_Client SHALL use model ID "global.anthropic.claude-opus-4-7" for all inference requests
2. THE Bedrock_Client SHALL connect to the us-west-2 region
3. THE Bedrock_Client SHALL invoke the synchronous converse() method with toolConfig specifying the tool_use method for structured output
4. THE Bedrock_Client SHALL enforce a request timeout of 30 seconds for each converse() call
5. IF the Bedrock Converse API returns an error or the request times out, THEN THE Bedrock_Client SHALL raise an exception that the Orchestrator translates into an error decision with a descriptive message
6. THE Bedrock_Client SHALL NOT retry failed requests automatically (single-attempt per invocation)

### Requirement 11: Response Parsing and Validation

**User Story:** As a developer, I want Claude's response validated before use, so that malformed LLM output does not corrupt interview state.

#### Acceptance Criteria

1. WHEN Claude returns a tool_use response, THE Parser SHALL extract the tool input from response['output']['message']['content'][0]['toolUse']['input'] and verify that all 4 rubric fields (concrete_example, situation_action_result, link_to_job, quantifiable_outcome) are present and are strictly boolean values (true or false only, with no type coercion from strings, integers, or null)
2. WHEN Claude returns a tool_use response, THE Parser SHALL verify that next_question is a string containing at least 1 non-whitespace character and at most 300 characters in total length
3. IF the response does not contain a toolUse block, OR any rubric field is missing or has a non-boolean type, OR next_question fails validation, THEN THE Parser SHALL return decision set to error, judgment set to null, and next_question set to null
4. FOR ALL valid tool_use responses from Claude, parsing then serializing to JSON then parsing the rubric judgment SHALL produce a deeply-equal object (all keys present with identical boolean values)
