# Project Summary

Build a voice-based résumé deep-dive mock interview app for students and internship candidates.

The user uploads a résumé, pastes a target job description, completes a spoken interview, and receives student-appropriate feedback.

The app should accept experience from internships, coursework, academic projects, personal projects, hackathons, student clubs, research, volunteering, and part-time work. It should not expect senior-level system design, large-scale production ownership, formal management experience, or many years of professional work.

## Interview Format

The interview includes:

- 3 main questions
- 1 adaptive follow-up after each main question
- up to 6 spoken answers
- an option to end the interview early
- no hints in the first version

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

The application should separately track the current interview point, whether the current stage is a main question or follow-up, whether the follow-up has already been used, and whether the interview is complete.

### Evaluator Agent

After the interview, the Evaluator receives:

- the full question-and-answer transcript
- candidate level
- target role
- completion status
- number of completed main questions
- number of completed follow-ups
- whether the interview ended early

It should generate:

- overall readiness
- category scores
- strengths
- areas for improvement
- strongest response
- one response to practise
- recommended next steps

Suggested feedback categories:

- Communication
- Personal contribution
- Problem-solving
- Technical understanding
- Learning and reflection
- Teamwork
- Role alignment

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

After the third follow-up answer, the interview ends and the transcript is sent to the Evaluator.

If the user ends early, the Evaluator should score only what was covered and avoid penalizing areas with insufficient evidence.

## AWS Services

- Amazon S3 for résumé upload and configuration files
- Amazon Bedrock for the Analyst and Evaluator
- Amazon Nova 2 Sonic for the spoken interview
- AWS Lambda for résumé analysis, configuration loading, and evaluation
- Amazon API Gateway for frontend-to-backend requests
- AWS Amplify Hosting for the frontend

No database, authentication, hints, or permanent interview history are required for the first version.
