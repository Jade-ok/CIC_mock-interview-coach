# Requirements Document

## Introduction

The Interviewer module is a lightweight session-setup Lambda (Python 3.12) that prepares everything needed for a voice interview powered by Amazon Nova Sonic. It receives the complete Analyst output (candidate information, job details, selected experiences, and interview context), loads interview configuration from S3, builds a runtime context, and returns it to the frontend. The frontend then connects directly to Nova Sonic via WebSocket to conduct the spoken interview.

The Interviewer Lambda does not conduct the interview, stream audio, score answers, or make any LLM calls. It is a pure context-builder: Analyst output in, runtime context out.

After the interview completes, the frontend sends the original Analyst output plus the Q&A transcript directly to the Evaluator Lambda. The Interviewer is not involved post-interview.

The schemas for the Analyst output, Evaluator input, interview structure, and interview profile are defined and versioned separately. This document references them by role but does not define their shape.

## Glossary

- **Interviewer_Lambda**: The AWS Lambda function (Python 3.12) that builds the runtime context for Nova Sonic
- **Analyst_Output**: The complete output from the Analyst agent containing candidate profile, job details, selected experiences, skills alignment, and all context needed for the interview. Its schema is defined separately.
- **Interview_Structure**: A JSON configuration stored in S3 defining what the interview covers (number of main questions, interview points, focus areas, follow-up topics). Its schema is defined separately.
- **Interview_Profile**: A JSON configuration stored in S3 defining how the interviewer behaves for a given candidate level (tone, question style, follow-up rules, acceptable experience types). Currently only student-v1 exists. Its schema is defined separately.
- **Runtime_Context**: The combined instruction returned to the frontend, built from the Analyst output, interview structure, and interview profile. The frontend provides this to Nova Sonic as its system instruction.
- **Nova_Sonic**: Amazon Nova Sonic — a speech-to-speech model that generates interview questions and understands spoken candidate answers. The frontend connects to it directly via WebSocket.
- **Transcript**: The ordered list of questions asked and answers given during the interview, collected by the frontend from Nova Sonic session events.

## Requirements

### Requirement 1: Receive Analyst Output

**User Story:** As a system, I want the Interviewer Lambda to accept the full Analyst output, so that the runtime context includes all candidate-specific information for Nova Sonic.

#### Acceptance Criteria

1. THE module SHALL accept the complete Analyst output as input (conforming to the Analyst → Interviewer schema)
2. THE module SHALL NOT modify, filter, or transform the Analyst output — it is included in the runtime context as-is
3. IF the Analyst output is missing or empty, THEN the module SHALL return an error indicating that Analyst data is required
4. THE module SHALL include the full Analyst output in the runtime context so Nova Sonic can personalize questions based on the candidate's background

### Requirement 2: S3 Configuration Loading

**User Story:** As a system, I want to load interview structure and interview profile from S3, so that interview format and behavior are configurable without code changes.

#### Acceptance Criteria

1. WHEN the Lambda is invoked, the module SHALL load the interview structure JSON from S3
2. WHEN the Lambda is invoked, the module SHALL load the interview profile JSON from S3
3. IF either S3 object is missing or cannot be parsed as valid JSON, THEN the module SHALL return an error indicating which configuration failed to load
4. THE S3 client SHALL connect to the us-west-2 region
5. THE S3 bucket name and object keys SHALL be configurable via environment variables

### Requirement 3: Runtime Context Assembly

**User Story:** As a system, I want to combine the Analyst output with S3 configurations into a single runtime context, so that the frontend can provide it to Nova Sonic as a complete system instruction.

#### Acceptance Criteria

1. THE module SHALL assemble a runtime context combining the Analyst output, interview structure, and interview profile
2. THE runtime context SHALL include all candidate-specific information from the Analyst output so Nova Sonic can ask personalized questions
3. THE runtime context SHALL include the interview structure so Nova Sonic knows what topics to cover, how many questions to ask, and what follow-up guidance to use
4. THE runtime context SHALL include the interview profile so Nova Sonic knows how to behave (tone, style, rules, acceptable experience types)
5. THE runtime context SHALL include behavioral instructions for Nova Sonic:
   - Ask one question at a time (no compound questions)
   - Keep questions concise and use clear language
   - Follow the tone specified by the interview profile
   - Accept the experience types listed in the interview profile
   - Do not invent details not present in the candidate data
   - Do not give feedback or score answers during the interview
   - Stop gracefully when the session ends
6. THE runtime context SHALL be returned to the frontend as a structured string or JSON object suitable for use as Nova Sonic's system instruction

### Requirement 4: Lambda Entry Point

**User Story:** As a deployer, I want the Lambda handler to support both direct invocation and Function URL modes, so that it can be called from the frontend.

#### Acceptance Criteria

1. THE handler SHALL support two invocation modes: direct (event = payload) and Function URL (event = {"body": "<JSON string>"})
2. WHEN invoked via Function URL, the handler SHALL parse the request body from event['body'] as JSON
3. IF event contains a 'body' key that is not valid JSON, THEN the handler SHALL return statusCode 400 with an error message
4. WHEN the request is successfully processed, the handler SHALL return statusCode 200 with the runtime context in the response body
5. IF an unhandled exception occurs, the handler SHALL return statusCode 500 with an error message
6. THE handler SHALL NOT set CORS headers in the response (CORS is configured on the Function URL)

### Requirement 5: Error Handling

**User Story:** As a developer, I want clear error responses, so that failures can be diagnosed and the frontend can display appropriate messages.

#### Acceptance Criteria

1. IF S3 configuration loading fails, the module SHALL return an error with a message identifying which config file could not be loaded
2. IF the Analyst output is invalid or missing, the module SHALL return a validation error before attempting S3 loads
3. ALL error responses SHALL include an error_message field with a human-readable description
4. ALL error responses SHALL include a success field set to false
5. ALL success responses SHALL include a success field set to true and the runtime_context field

### Requirement 6: Response Shape

**User Story:** As a frontend developer, I want a predictable response format, so that I can reliably extract the runtime context or handle errors.

#### Acceptance Criteria

1. ON SUCCESS, the response body SHALL contain: success (true), runtime_context (the assembled context for Nova Sonic)
2. ON ERROR, the response body SHALL contain: success (false), error_message (human-readable description)
3. THE response SHALL always be wrapped in Function URL format: {"statusCode": int, "body": "<JSON string>"}
