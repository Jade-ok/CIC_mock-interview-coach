"""
End-to-end pipeline integration test: analyst -> interviewer -> evaluator.

Mocks AWS calls (Bedrock + S3) to validate data contracts between stages.
No AWS credentials required. Each stage runs in an isolated subprocess to
keep its mocked AWS clients isolated.

Usage:
    python3 tests/integration/test_pipeline.py
"""

import json
import subprocess
import sys
import time
from pathlib import Path

TEST_DIR = Path(__file__).resolve().parent
REPO_ROOT = TEST_DIR.parents[1]


def run_stage(script_name: str, stage_label: str) -> dict:
    """Run a stage script as a subprocess and return its JSON output."""
    script_path = TEST_DIR / script_name
    start = time.time()
    result = subprocess.run(
        [sys.executable, script_path],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=REPO_ROOT,
    )
    elapsed = time.time() - start

    print(f"  Time: {elapsed:.3f}s")

    if result.returncode != 0:
        print(f"  FAIL (exit {result.returncode})")
        print(f"  stderr: {result.stderr[:500]}")
        print(f"  stdout: {result.stdout[:500]}")
        return None

    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"  FAIL: Could not parse JSON output")
        print(f"  stdout: {result.stdout[:500]}")
        return None

    return output


def main():
    print("=" * 70)
    print("PIPELINE INTEGRATION TEST (mocked AWS calls)")
    print("=" * 70)
    errors = []

    # ---- STEP 1: ANALYST ----
    print("\n" + "-" * 70)
    print("STEP 1: ANALYST")
    print("-" * 70)

    analyst_output = run_stage("stage_analyst.py", "Analyst")
    if analyst_output is None:
        errors.append("Analyst stage failed")
        print("\n  Cannot continue without analyst output.")
        return errors

    # Validate analyst output
    required_keys = ["schema_version", "candidate_profile", "target_role",
                     "resume_job_alignment", "interview_plan",
                     "selected_experiences", "analysis_warnings"]
    missing = [k for k in required_keys if k not in analyst_output]
    if missing:
        print(f"  FAIL: Missing keys: {missing}")
        errors.append(f"Analyst missing keys: {missing}")
        return errors

    print(f"  schema_version: {analyst_output['schema_version']}")
    print(f"  candidate_level: {analyst_output['candidate_profile']['candidate_level']}")
    print(f"  target_role: {analyst_output['target_role']['title']}")
    print(f"  selected_experiences: {len(analyst_output['selected_experiences'])}")
    print(f"  interview_plan: {len(analyst_output['interview_plan'])}")
    print(f"  analysis_warnings: {analyst_output['analysis_warnings']}")
    print("  PASS")

    # ---- STEP 2: INTERVIEWER ----
    print("\n" + "-" * 70)
    print("STEP 2: INTERVIEWER")
    print("-" * 70)

    # Write analyst output to a temp file for the interviewer stage to read
    with (TEST_DIR / "_test_analyst_output.json").open("w") as f:
        json.dump(analyst_output, f)

    interviewer_output = run_stage("stage_interviewer.py", "Interviewer")
    if interviewer_output is None:
        errors.append("Interviewer stage failed")
        return errors

    runtime_context = interviewer_output.get("runtime_context", "")
    print(f"  runtime_context length: {len(runtime_context)} chars")
    sections = ["[CANDIDATE DATA]", "[INTERVIEW STRUCTURE]",
                "[INTERVIEW PROFILE]", "[BEHAVIORAL INSTRUCTIONS]"]
    for s in sections:
        present = s in runtime_context
        print(f"  {'OK' if present else 'MISSING'}: {s}")
        if not present:
            errors.append(f"Missing section: {s}")

    if analyst_output["target_role"]["title"] not in runtime_context:
        errors.append("Analyst data not embedded in runtime context")
    else:
        print("  PASS: analyst_output embedded in runtime context")

    # ---- STEP 3: EVALUATOR ----
    print("\n" + "-" * 70)
    print("STEP 3: EVALUATOR")
    print("-" * 70)

    evaluator_output = run_stage("stage_evaluator.py", "Evaluator")
    if evaluator_output is None:
        errors.append("Evaluator stage failed")
        return errors

    print(f"  Readiness: {evaluator_output['readiness_label']}")
    print(f"  Overall score: {evaluator_output['overall_scores']['total']}/5.0")
    print(f"  Questions scored: {evaluator_output['question_count']}")
    print(f"  Dimension scores:")
    for dim, score in evaluator_output["overall_scores"]["dimensions"].items():
        print(f"    {dim}: {score}/5.0")
    print(f"  Strengths: {len(evaluator_output.get('strengths', []))}")
    print(f"  Improvements: {len(evaluator_output.get('improvements', []))}")
    print(f"  Contextual advice: {len(evaluator_output.get('contextual_advice', []))}")

    # Validate evaluator output
    total = evaluator_output["overall_scores"]["total"]
    if not (1.0 <= total <= 5.0):
        errors.append(f"Total score {total} outside 1-5 range")

    valid_labels = ["Interview ready", "Strong foundation", "Developing well",
                    "Needs more practice", "Needs clearer examples"]
    if evaluator_output["readiness_label"] not in valid_labels:
        errors.append(f"Invalid readiness label: {evaluator_output['readiness_label']}")

    if evaluator_output["question_count"] != 6:
        errors.append(f"Expected 6 scored questions, got {evaluator_output['question_count']}")

    # Validate metadata pass-through
    meta = evaluator_output.get("interview_metadata", {})
    if meta.get("status") != "completed":
        errors.append("interview_metadata not passed through correctly")

    if not errors:
        print("  PASS")

    return errors


def cleanup_temp_files():
    """Remove files shared between the isolated pipeline stages."""
    for filename in ["_test_analyst_output.json"]:
        path = TEST_DIR / filename
        if path.exists():
            path.unlink()


def test_pipeline():
    """Expose the mocked end-to-end pipeline to pytest collection."""
    try:
        assert main() == []
    finally:
        cleanup_temp_files()


if __name__ == "__main__":
    try:
        errors = main()
    finally:
        cleanup_temp_files()

    print("\n" + "=" * 70)
    print("PIPELINE SUMMARY")
    print("=" * 70)
    if errors:
        print(f"\n  FAILED with {len(errors)} error(s):")
        for e in errors:
            print(f"    - {e}")
        sys.exit(1)
    else:
        print("\n  ALL 3 STAGES PASSED")
        print("  Data flows correctly: analyst -> interviewer -> evaluator")
        print("  Contracts validated between all stages")
        print()
        sys.exit(0)
