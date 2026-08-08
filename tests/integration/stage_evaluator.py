"""Stage 3: Evaluator — runs in isolation with mocked Bedrock."""
import json
import sys
from pathlib import Path
from unittest.mock import patch

TEST_DIR = Path(__file__).resolve().parent
REPO_ROOT = TEST_DIR.parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend" / "functions"))

# Read analyst output
with (TEST_DIR / "_test_analyst_output.json").open() as f:
    analyst_output = json.load(f)

CONVERSATION = [
    {"point_id": "point_1", "turn_type": "main_question",
     "question": "Walk me through a project and your specific contribution?",
     "answer": "At TechCorp I built a REST API with FastAPI. I designed endpoints, wrote business logic, and achieved 85% test coverage with pytest. The tool was used by 20 developers."},
    {"point_id": "point_1", "turn_type": "follow_up",
     "question": "What features did you implement and how did you decide on the endpoint structure?",
     "answer": "CRUD endpoints for tool configs. I matched existing company patterns and iterated with senior feedback twice before finalizing."},
    {"point_id": "point_2", "turn_type": "main_question",
     "question": "Tell me about a technical challenge and how you solved it.",
     "answer": "In the hackathon, rule-based matching failed on edge cases. I integrated OpenAI API, learned prompt engineering on the fly, and managed rate limits. We won 2nd place."},
    {"point_id": "point_2", "turn_type": "follow_up",
     "question": "What alternatives did you consider?",
     "answer": "Weighted scoring didn't handle group dynamics. Scikit-learn clustering was too slow to implement in a hackathon. The API let me iterate on prompts faster."},
    {"point_id": "point_3", "turn_type": "main_question",
     "question": "What did you learn from collaborating and how does it connect to this role?",
     "answer": "Code reviews taught me patterns from seniors. I learned to ask questions early. In the hackathon I owned the backend and coordinated with the frontend dev."},
    {"point_id": "point_3", "turn_type": "follow_up",
     "question": "Give a specific example of resolving a disagreement with a team member.",
     "answer": "A team member wanted one monolithic file. I pushed for separation. We compromised with clean modules but shared types. It saved debugging time."},
]

MOCK_LLM_RESPONSE = {
    "output": {"message": {"content": [{"toolUse": {"toolUseId": "e1", "name": "submit_evaluation", "input": {
        "per_question_scores": [
            {"question_text": "Walk me through a project?", "answer_summary": "TechCorp REST API, 85% coverage, 20 users.",
             "scores": {"concrete_example": 5, "situation_action_result": 4, "link_to_job": 4, "quantifiable_outcome": 5}},
            {"question_text": "Features and endpoint structure?", "answer_summary": "CRUD endpoints, iterated with feedback.",
             "scores": {"concrete_example": 4, "situation_action_result": 4, "link_to_job": 3, "quantifiable_outcome": 2}},
            {"question_text": "Technical challenge?", "answer_summary": "Hackathon matching, pivoted to OpenAI.",
             "scores": {"concrete_example": 5, "situation_action_result": 5, "link_to_job": 3, "quantifiable_outcome": 4}},
            {"question_text": "Alternatives considered?", "answer_summary": "Weighted scoring, clustering, chose API.",
             "scores": {"concrete_example": 4, "situation_action_result": 5, "link_to_job": 3, "quantifiable_outcome": 2}},
            {"question_text": "Learning from collaboration?", "answer_summary": "Code reviews, asking questions early.",
             "scores": {"concrete_example": 4, "situation_action_result": 4, "link_to_job": 5, "quantifiable_outcome": 2}},
            {"question_text": "Resolving disagreement?", "answer_summary": "Monolith vs modules, compromised.",
             "scores": {"concrete_example": 5, "situation_action_result": 5, "link_to_job": 4, "quantifiable_outcome": 3}}
        ],
        "strengths": [
            "Provides specific examples with measurable outcomes (85% coverage, 20 users).",
            "Strong problem-solving narrative showing alternatives considered.",
            "Growth mindset with reflections on learning from code reviews."
        ],
        "improvements": [
            "Could better connect experiences to Acme Corp specifically.",
            "Quantifiable outcomes weaker outside internship context.",
            "Follow-up answers sometimes lose SAR structure."
        ],
        "contextual_advice": [
            "Mention AWS experience more specifically when discussing TechCorp.",
            "Reference algorithms coursework when discussing problem-solving.",
            "Draw on code review workflow for sprint planning questions."
        ]
    }}}]}}
}

interview_metadata = {
    "candidate_level": analyst_output["candidate_profile"]["candidate_level"],
    "target_role": analyst_output["target_role"]["title"],
    "status": "completed",
    "completion_reason": "all_questions_completed",
    "main_questions_completed": 3,
    "follow_ups_completed": 3,
    "ended_early": False,
}

evaluator_event = {
    "body": json.dumps({
        "analyst_output": analyst_output,
        "conversation": CONVERSATION,
        "interview_metadata": interview_metadata,
    })
}

with patch("evaluator.bedrock_client._client") as mock_bedrock:
    mock_bedrock.converse.return_value = MOCK_LLM_RESPONSE
    from evaluator.lambda_handler import handler
    response = handler(evaluator_event, None)

body = json.loads(response["body"])
if response["statusCode"] == 200:
    print(json.dumps(body))
    sys.exit(0)
else:
    print(json.dumps(body), file=sys.stderr)
    sys.exit(1)
