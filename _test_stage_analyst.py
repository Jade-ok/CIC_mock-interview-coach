"""Stage 1: Analyst — runs in isolation with mocked Bedrock."""
import json
import sys
import os
from unittest.mock import patch

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

# Mock Bedrock response
MOCK_RESPONSE = {
    "output": {"message": {"content": [{"toolUse": {"toolUseId": "m1", "name": "analyst_output", "input": {
        "schema_version": "1.0",
        "candidate_profile": {
            "candidate_level": "student_intern",
            "education_summary": "3rd year CS at UBC (2023-2027)",
            "experience_summary": "One internship at TechCorp plus a hackathon project.",
            "relevant_skills": ["Python", "JavaScript", "TypeScript", "React", "FastAPI", "PostgreSQL", "Git", "AWS"],
            "experience_types_available": ["internship", "hackathon", "coursework"]
        },
        "target_role": {
            "title": "Software Engineering Intern",
            "company": "Acme Corp",
            "seniority": "intern",
            "role_summary": "4-month platform team internship.",
            "required_skills": ["Python", "JavaScript", "web frameworks", "problem-solving"],
            "preferred_skills": ["AWS", "REST APIs", "testing frameworks"],
            "key_responsibilities": ["Backend services", "Automated tests", "Code reviews", "Sprint planning"],
            "evaluation_priorities": ["technical skills", "collaboration", "problem-solving"]
        },
        "resume_job_alignment": {
            "strong_matches": [
                {"resume_evidence": "Built REST API with FastAPI", "job_requirement": "Develop backend services", "match_reason": "Direct backend experience"},
                {"resume_evidence": "pytest 85% coverage", "job_requirement": "Write automated tests", "match_reason": "Testing experience"},
                {"resume_evidence": "Weekly code reviews", "job_requirement": "Code reviews", "match_reason": "Direct experience"}
            ],
            "partial_matches": [
                {"resume_evidence": "AWS S3/Lambda listed", "job_requirement": "Cloud services", "match_reason": "Listed but depth unclear"}
            ],
            "areas_to_explore": [
                {"topic": "Sprint planning", "reason": "No agile mention in resume"},
                {"topic": "AWS depth", "reason": "Skills listed without project details"}
            ]
        },
        "interview_plan": [
            {"topic": "TechCorp API development", "priority": 1, "question_type": "behavioral", "target_skill": "technical implementation", "source_experience_id": "exp_1"},
            {"topic": "Hackathon problem-solving", "priority": 2, "question_type": "behavioral", "target_skill": "problem-solving", "source_experience_id": "exp_2"},
            {"topic": "Collaboration and learning", "priority": 3, "question_type": "behavioral", "target_skill": "collaboration", "source_experience_id": "exp_1"}
        ],
        "selected_experiences": [
            {
                "experience_id": "exp_1", "title": "Software Developer Intern", "experience_type": "internship",
                "organization": "TechCorp", "summary": "Built REST API, 85% test coverage, code reviews with seniors.",
                "candidate_claims": ["85% coverage", "used by 20 devs"], "skills_demonstrated": ["Python", "FastAPI", "pytest"],
                "job_requirements_supported": ["backend", "testing", "code reviews"],
                "relevance_score": 0.9, "relevance_reason": "Direct match to responsibilities",
                "details_to_clarify": ["API scale", "Features built"]
            },
            {
                "experience_id": "exp_2", "title": "Study Group Matcher", "experience_type": "hackathon",
                "organization": "UBC Hackathon", "summary": "Next.js + OpenAI API, won 2nd place.",
                "candidate_claims": ["2nd place among 30 teams"], "skills_demonstrated": ["JavaScript", "API integration"],
                "job_requirements_supported": ["problem-solving", "web frameworks"],
                "relevance_score": 0.75, "relevance_reason": "Shows problem-solving under constraints",
                "details_to_clarify": ["Personal contribution", "Decision-making"]
            }
        ],
        "analysis_warnings": []
    }}}]}}
}

EVENT = {
    "resume_text": "Jane Doe\nCS at UBC (2023-2027)\n\nInternship: SDE Intern, TechCorp (May-Aug 2024)\n- Built REST API with FastAPI\n- pytest 85% coverage\n- Code reviews with 3 seniors\n\nHackathon: Study Group Matcher (Jan 2024)\n- Next.js + OpenAI API\n- Won 2nd place / 30 teams\n\nSkills: Python, JavaScript, TypeScript, React, FastAPI, PostgreSQL, Git, AWS",
    "job_posting_text": "SWE Intern at Acme Corp\n\nRequirements:\n- CS degree\n- Python or JavaScript\n- Web frameworks\n- Problem-solving\n\nPreferred:\n- AWS\n- REST APIs\n- Testing\n\nResponsibilities:\n- Backend services\n- Automated tests\n- Code reviews\n- Cross-functional collaboration"
}

with patch("analyst.bedrock_client._client") as mock_client:
    mock_client.converse.return_value = MOCK_RESPONSE
    from analyst.handler import lambda_handler
    response = lambda_handler(EVENT, None)

body = json.loads(response["body"])
if response["statusCode"] == 200 and body.get("status") == "success":
    print(json.dumps(body["data"]))
    sys.exit(0)
else:
    print(json.dumps(body), file=sys.stderr)
    sys.exit(1)
