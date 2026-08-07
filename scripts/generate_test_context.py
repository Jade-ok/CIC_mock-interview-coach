"""
Generate the runtime context for the test UI.

Runs the interviewer's context_builder with local config files and a mock
analyst output, then writes it to scripts/test_runtime_context.js for the
HTML test page to load.

Usage: python3 scripts/generate_test_context.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from interviewer.context_builder import build_runtime_context

# Load local configs
with open(os.path.join(ROOT, ".kiro", "specs", "interviewer-agent", "schemas", "interview_structure.json")) as f:
    interview_structure = json.load(f)

with open(os.path.join(ROOT, ".kiro", "specs", "interviewer-agent", "schemas", "student_interview.json")) as f:
    interview_profile = json.load(f)

# Realistic analyst output for testing
analyst_output = {
    "schema_version": "1.0",
    "candidate_profile": {
        "candidate_level": "student_intern",
        "education_summary": "3rd year Computer Science at UBC (2023-2027)",
        "experience_summary": "One internship at TechCorp building REST APIs, plus a hackathon project.",
        "relevant_skills": ["Python", "JavaScript", "TypeScript", "React", "FastAPI", "PostgreSQL", "Git", "AWS"],
        "experience_types_available": ["internship", "hackathon", "coursework"]
    },
    "target_role": {
        "title": "Software Engineering Intern",
        "company": "Acme Corp",
        "seniority": "intern",
        "role_summary": "4-month platform team internship focused on backend services.",
        "required_skills": ["Python", "JavaScript", "web frameworks", "problem-solving"],
        "preferred_skills": ["AWS", "REST APIs", "testing frameworks"],
        "key_responsibilities": ["Develop backend services", "Write automated tests", "Code reviews", "Sprint planning"],
        "evaluation_priorities": ["technical skills", "collaboration", "problem-solving", "communication"]
    },
    "resume_job_alignment": {
        "strong_matches": [
            {"resume_evidence": "Built REST API with FastAPI", "job_requirement": "Develop backend services", "match_reason": "Direct backend experience"},
            {"resume_evidence": "pytest 85% coverage", "job_requirement": "Write automated tests", "match_reason": "Testing experience"},
            {"resume_evidence": "Weekly code reviews at TechCorp", "job_requirement": "Participate in code reviews", "match_reason": "Direct experience"}
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
            "experience_id": "exp_1",
            "title": "Software Developer Intern",
            "experience_type": "internship",
            "organization": "TechCorp",
            "summary": "Built REST API with FastAPI for internal tooling. Achieved 85% test coverage with pytest. Weekly code reviews with 3 senior engineers.",
            "candidate_claims": ["85% test coverage", "used by 20 developers internally"],
            "skills_demonstrated": ["Python", "FastAPI", "pytest", "code review"],
            "job_requirements_supported": ["backend development", "automated testing", "code reviews"],
            "relevance_score": 0.9,
            "relevance_reason": "Direct match to backend development responsibilities",
            "details_to_clarify": ["Scale of API", "Specific features built", "Code review feedback received"]
        },
        {
            "experience_id": "exp_2",
            "title": "Study Group Matcher",
            "experience_type": "hackathon",
            "organization": "UBC Hackathon",
            "summary": "Built Next.js app with OpenAI API integration for student matching. Won 2nd place among 30 teams.",
            "candidate_claims": ["Won 2nd place among 30 teams"],
            "skills_demonstrated": ["JavaScript", "Next.js", "API integration", "teamwork"],
            "job_requirements_supported": ["problem-solving", "web frameworks"],
            "relevance_score": 0.75,
            "relevance_reason": "Shows problem-solving and rapid development under constraints",
            "details_to_clarify": ["Personal vs team contribution", "Technical decision-making process"]
        }
    ],
    "analysis_warnings": []
}

# Build runtime context
runtime_context = build_runtime_context(analyst_output, interview_structure, interview_profile)

# Write as JS variable
output_path = os.path.join(ROOT, "scripts", "test_runtime_context.js")
with open(output_path, "w") as f:
    f.write("// Auto-generated by generate_test_context.py\n")
    f.write("window.RUNTIME_CONTEXT = ")
    f.write(json.dumps(runtime_context))
    f.write(";\n")

print(f"Written to: {output_path}")
print(f"Context length: {len(runtime_context)} chars")
