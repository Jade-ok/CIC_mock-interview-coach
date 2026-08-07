# Requirements Document

## Introduction

The Resume Analysis Pipeline is a two-Lambda pipeline for the mock interview coaching app. It handles document intake (resume PDFs and job postings) via the `pdf_parser` Lambda, then produces a structured JSON analysis via the `analyst` Lambda. The analyst output serves as the interface contract consumed by downstream Lambdas (interviewer, evaluator) and the frontend. The target audience is university students preparing for behavioral job interviews.

## Glossary

- **PDF_Parser**: The Lambda function responsible for extracting text from uploaded PDF documents and accepting plain-text job postings. Uses the pypdf library.
- **Analyst**: The Lambda function that receives extracted text (resume and job posting) and produces a structured JSON analysis via the Bedrock Converse API with tool_use.
- **Analyst_Output**: The structured JSON object produced by the Analyst Lambda, conforming to a versioned schema. This is the interface contract with downstream consumers.
- **Resume**: A candidate's resume document, always provided as a base64-encoded PDF.
- **Job_Posting**: A job description provided either as a base64-encoded PDF or as plain text, distinguished by a format flag from the frontend.
- **Format_Flag**: A field in the request payload indicating whether the job posting is provided as `"pdf"` or `"text"`.
- **Function_URL_Mode**: An invocation mode where the Lambda event wraps the payload inside `event['body']` as a JSON string.
- **Direct_Mode**: An invocation mode where the Lambda event is the payload itself.
- **Converse_API**: Amazon Bedrock's Converse API used with tool_use to force structured JSON output from Claude.
- **Candidate_Profile**: A section of the Analyst_Output summarizing the candidate's education, experience, and skills.
- **Resume_Job_Alignment**: A section of the Analyst_Output mapping resume evidence to job requirements.
- **Selected_Experiences**: A section of the Analyst_Output containing prioritized experiences relevant to the target role.
- **Analysis_Warnings**: A list of warnings in the Analyst_Output flagging quality issues (e.g., missing data, ambiguous content).

## Requirements

### Requirement 1: PDF Text Extraction

**User Story:** As a frontend application, I want to send a base64-encoded PDF to the pdf_parser Lambda, so that the text content is extracted for downstream analysis.

#### Acceptance Criteria

1. WHEN a valid base64-encoded PDF is provided in the request payload, THE PDF_Parser SHALL decode the base64 content and extract all text from the PDF using pypdf.
2. WHEN the extracted text is ready, THE PDF_Parser SHALL return a JSON response containing the extracted text and the document type label (resume or job_posting).
3. IF the base64 content cannot be decoded into a valid PDF, THEN THE PDF_Parser SHALL return a JSON error response with a descriptive error message and a 400 status indicator.
4. IF the PDF contains zero extractable text, THEN THE PDF_Parser SHALL return a JSON error response indicating that no text could be extracted from the document.

### Requirement 2: Job Posting Intake (Dual Format)

**User Story:** As a frontend application, I want to send a job posting as either a PDF or plain text, so that the pdf_parser Lambda can handle both formats based on a format flag.

#### Acceptance Criteria

1. WHEN the Format_Flag is set to `"pdf"`, THE PDF_Parser SHALL decode the base64-encoded job posting and extract text using pypdf.
2. WHEN the Format_Flag is set to `"text"`, THE PDF_Parser SHALL accept the plain-text job posting content directly without PDF processing.
3. IF the Format_Flag is missing or contains an unrecognized value, THEN THE PDF_Parser SHALL return a JSON error response indicating an invalid format flag.

### Requirement 3: Combined Document Intake

**User Story:** As a frontend application, I want to send both the resume and job posting in a single request to pdf_parser, so that I can reduce the number of network calls.

#### Acceptance Criteria

1. WHEN both a resume PDF and a job posting are provided in a single request, THE PDF_Parser SHALL process both documents and return extracted text for each.
2. WHEN only a resume PDF is provided, THE PDF_Parser SHALL process the resume and return extracted text for it alone.
3. WHEN only a job posting is provided, THE PDF_Parser SHALL process the job posting and return extracted text for it alone.
4. IF both documents are provided and one fails extraction, THEN THE PDF_Parser SHALL return extracted text for the successful document and an error entry for the failed document.

### Requirement 4: Input Validation (pdf_parser)

**User Story:** As a system operator, I want the pdf_parser Lambda to validate all inputs before processing, so that malformed requests are rejected early with clear error messages.

#### Acceptance Criteria

1. THE PDF_Parser SHALL validate that the request payload contains at least one document (resume or job_posting) before processing.
2. IF the request payload exceeds 4 MB for any single PDF document, THEN THE PDF_Parser SHALL return a JSON error response indicating the document exceeds the size limit.
3. IF the request payload is missing required fields, THEN THE PDF_Parser SHALL return a JSON error response listing the missing fields.
4. WHEN a request is received in Function_URL_Mode, THE PDF_Parser SHALL parse the JSON string from `event['body']` before validation.
5. WHEN a request is received in Direct_Mode, THE PDF_Parser SHALL use the event payload directly for validation.

### Requirement 5: Analyst Resume and Job Posting Analysis

**User Story:** As the interviewer Lambda, I want the analyst to produce a structured JSON analysis of the candidate's resume against the job posting, so that I can build interview context for Nova Sonic.

#### Acceptance Criteria

1. WHEN extracted resume text and extracted job posting text are both provided, THE Analyst SHALL produce an Analyst_Output JSON object conforming to schema version 1.0.
2. THE Analyst SHALL populate the Candidate_Profile section with education_summary, experience_summary, relevant_skills, and candidate_level derived from the resume text.
3. THE Analyst SHALL populate the target_role section with title, company, seniority, role_summary, required_skills, preferred_skills, key_responsibilities, and evaluation_priorities derived from the job posting text.
4. THE Analyst SHALL populate the Resume_Job_Alignment section with strong_matches, partial_matches, and areas_to_explore comparing the resume against the job posting.
5. THE Analyst SHALL populate the Selected_Experiences section with up to 5 prioritized experiences, each containing experience_id, title, experience_type, organization, summary, candidate_claims, skills_demonstrated, job_requirements_supported, relevance_score, relevance_reason, and details_to_clarify.
6. THE Analyst SHALL assign a relevance_score between 0.0 and 1.0 (inclusive) to each selected experience.

### Requirement 6: Analyst Output Schema Compliance

**User Story:** As a downstream consumer (interviewer, evaluator, frontend), I want the analyst output to always conform to the defined schema, so that I can parse it reliably without error handling for structural variations.

#### Acceptance Criteria

1. THE Analyst SHALL include the field `schema_version` set to `"1.0"` in every Analyst_Output response.
2. THE Analyst SHALL include all top-level keys (candidate_profile, target_role, resume_job_alignment, selected_experiences, analysis_warnings) in every Analyst_Output response.
3. THE Analyst SHALL set `experience_type` to one of the allowed values: `"internship"`, `"coursework"`, `"academic_project"`, `"personal_project"`, `"hackathon"`, or `"student_club"`.
4. THE Analyst SHALL use the Converse_API with tool_use to force Claude to produce JSON conforming to the defined schema.
5. WHEN the Converse_API response does not conform to the expected schema, THE Analyst SHALL retry the Bedrock call once (maximum 2 total attempts).
6. IF the Analyst_Output still does not conform after the retry, THEN THE Analyst SHALL return an error response indicating schema validation failure.

### Requirement 7: Analyst Bedrock Configuration

**User Story:** As a deployment engineer, I want the analyst Lambda to target a specific region and model for Bedrock calls, so that the system is consistent with the rest of the stack and the model is easily swappable.

#### Acceptance Criteria

1. THE Analyst SHALL target the `us-east-1` region for all Bedrock Converse API calls.
2. THE Analyst SHALL use the model ID `global.anthropic.claude-sonnet-5` as the default model for Bedrock calls.
3. THE Analyst SHALL allow the model ID to be swapped by changing only the model ID string, with no other code changes required.

### Requirement 8: Analyst Input Validation

**User Story:** As a system operator, I want the analyst Lambda to validate inputs before calling Bedrock, so that invalid requests do not consume Bedrock API quota.

#### Acceptance Criteria

1. THE Analyst SHALL validate that both resume_text and job_posting_text are present and non-empty strings before calling the Converse_API.
2. IF resume_text or job_posting_text is missing or empty, THEN THE Analyst SHALL return a JSON error response listing the missing or empty fields.
3. WHEN a request is received in Function_URL_Mode, THE Analyst SHALL parse the JSON string from `event['body']` before validation.
4. WHEN a request is received in Direct_Mode, THE Analyst SHALL use the event payload directly for validation.

### Requirement 9: Bedrock API Error Handling

**User Story:** As a system operator, I want the analyst Lambda to handle Bedrock API failures gracefully, so that transient errors are retried and permanent failures return clear error messages.

#### Acceptance Criteria

1. IF the Converse_API call fails due to a transient error (timeout, throttling, 5xx), THEN THE Analyst SHALL retry the call once (maximum 2 total attempts).
2. IF the Converse_API call fails on both attempts, THEN THE Analyst SHALL return a JSON error response with the failure reason and a 502 status indicator.
3. IF the Converse_API call returns an invalid or unparseable response, THEN THE Analyst SHALL treat it as a failure and retry once.

### Requirement 10: Analysis Warnings

**User Story:** As a downstream consumer, I want the analyst to flag data quality issues in the analysis_warnings field, so that the interviewer can adjust its behavior for incomplete or ambiguous inputs.

#### Acceptance Criteria

1. WHEN the resume text contains fewer than 50 words, THE Analyst SHALL add a warning indicating insufficient resume content.
2. WHEN the job posting text contains fewer than 30 words, THE Analyst SHALL add a warning indicating insufficient job posting content.
3. WHEN no relevant experiences can be matched between the resume and the job posting, THE Analyst SHALL add a warning indicating low alignment.
4. THE Analyst SHALL return an empty list for analysis_warnings when no quality issues are detected.

### Requirement 11: Dual Invocation Mode Support

**User Story:** As a deployment engineer, I want both Lambdas to support direct invocation and Function URL invocation, so that the same code works for testing and production.

#### Acceptance Criteria

1. WHEN the event contains a `body` key with a string value, THE PDF_Parser SHALL treat the invocation as Function_URL_Mode and parse `event['body']` as JSON to extract the payload.
2. WHEN the event does not contain a `body` key, THE PDF_Parser SHALL treat the invocation as Direct_Mode and use the event as the payload.
3. WHEN the event contains a `body` key with a string value, THE Analyst SHALL treat the invocation as Function_URL_Mode and parse `event['body']` as JSON to extract the payload.
4. WHEN the event does not contain a `body` key, THE Analyst SHALL treat the invocation as Direct_Mode and use the event as the payload.

### Requirement 12: Response Format Consistency

**User Story:** As a frontend application, I want all Lambda responses to follow a consistent format, so that I can use a single parsing strategy for both success and error cases.

#### Acceptance Criteria

1. THE PDF_Parser SHALL return all success responses as JSON with a `status` field set to `"success"` and a `data` field containing the result payload.
2. THE PDF_Parser SHALL return all error responses as JSON with a `status` field set to `"error"` and an `error` field containing a descriptive message.
3. THE Analyst SHALL return all success responses as JSON with a `status` field set to `"success"` and a `data` field containing the Analyst_Output.
4. THE Analyst SHALL return all error responses as JSON with a `status` field set to `"error"` and an `error` field containing a descriptive message.
