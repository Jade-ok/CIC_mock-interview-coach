/**
 * Agent 3 client — calls the Evaluator HTTP stage to get feedback
 * based on the canonical Interviewer output contract.
 */

import type { Agent3Request, SessionState, TranscriptEntry } from '@/types/session';
import type { EvaluatorOutput } from '@/types/evaluator';
import { API_ENDPOINTS, jsonPostInit } from '@/services/apiConfig';

/** Controls whether the stub should simulate failure (for testing) */
let simulateFailure = false;

/**
 * Set whether the stub should simulate a failure response.
 * Useful for testing error/retry flows.
 */
export function setAgent3SimulateFailure(fail: boolean): void {
  simulateFailure = fail;
}

/**
 * Convert the UI transcript into the Evaluator's question-answer contract.
 * The interview prompt defines three points, each with a main question and follow-up.
 */
export function buildAgent3Request(state: SessionState): Agent3Request {
  if (!state.analystOutput) {
    throw new Error('Cannot evaluate an interview without Analyst output.');
  }

  const conversation = pairConversation(state.transcript);
  // Six answer pairs means the scripted three-main/three-follow-up interview
  // completed, even when the user closes it manually after Nova's sign-off.
  const completed = conversation.length === 6;
  const candidateProfile = state.analystOutput.candidate_profile as
    | Record<string, unknown>
    | undefined;
  const targetRole = state.analystOutput.target_role as
    | Record<string, unknown>
    | undefined;

  return {
    analyst_output: state.analystOutput,
    conversation,
    interview_metadata: {
      candidate_level: String(candidateProfile?.candidate_level || 'unknown'),
      target_role: String(targetRole?.title || 'unknown'),
      status: completed ? 'completed' : 'ended_early',
      completion_reason: completed
        ? 'all_questions_completed'
        : 'user_ended_early',
      main_questions_completed: conversation.filter(
        (turn) => turn.turn_type === 'main_question'
      ).length,
      follow_ups_completed: conversation.filter(
        (turn) => turn.turn_type === 'follow_up'
      ).length,
      ended_early: !completed,
    },
  };
}

function pairConversation(transcript: TranscriptEntry[]): Agent3Request['conversation'] {
  // Merge consecutive entries from the same role into a single turn.
  // Nova may send multiple FINAL text_output events for one speech turn
  // (e.g., separate recognized utterance segments for a long user answer).
  const merged = mergeConsecutiveEntries(transcript);

  const conversation: Agent3Request['conversation'] = [];
  let pendingQuestion: string | null = null;

  for (const entry of merged) {
    if (entry.role === 'interviewer') {
      pendingQuestion = entry.text;
      continue;
    }
    if (!pendingQuestion || conversation.length >= 6) continue;

    const turnIndex = conversation.length;
    conversation.push({
      point_id: `point_${Math.floor(turnIndex / 2) + 1}`,
      turn_type: turnIndex % 2 === 0 ? 'main_question' : 'follow_up',
      question: pendingQuestion,
      answer: entry.text,
    });
    pendingQuestion = null;
  }

  return conversation;
}

/**
 * Merge consecutive transcript entries that share the same role into one entry.
 * This handles cases where Nova sends multiple FINAL events for a single
 * speech turn (common for longer user answers transcribed in segments).
 */
function mergeConsecutiveEntries(transcript: TranscriptEntry[]): TranscriptEntry[] {
  if (transcript.length === 0) return [];

  const merged: TranscriptEntry[] = [];
  let current = { ...transcript[0] };

  for (let i = 1; i < transcript.length; i++) {
    const entry = transcript[i];
    if (entry.role === current.role) {
      current.text += ' ' + entry.text;
    } else {
      merged.push(current);
      current = { ...entry };
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Calls the Evaluator with a canonical request.
 * Returns feedback data.
 */
export async function callAgent3(request: Agent3Request): Promise<EvaluatorOutput> {
  if (simulateFailure) {
    throw new Error('Agent 3 request failed: Internal Server Error (500)');
  }

  if (request.conversation.length === 0) {
    throw new Error('At least one completed question and answer is required for evaluation.');
  }

  const response = await fetch(API_ENDPOINTS.evaluator, await jsonPostInit(request));

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result?.message || result?.error || response.statusText || `HTTP ${response.status}`;
    throw new Error(`Evaluation failed: ${message}`);
  }

  // The evaluator normally uses non-2xx status codes for errors, but retain a
  // defensive check in case an intermediary returns its error body with 200.
  if (result?.error) {
    throw new Error(`Evaluation failed: ${result.message || result.error}`);
  }

  if (!isEvaluatorOutput(result)) {
    throw new Error('Evaluation failed: Evaluator returned an invalid response.');
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrow an HTTP response before FeedbackReport dereferences nested fields. */
export function isEvaluatorOutput(value: unknown): value is EvaluatorOutput {
  if (!isRecord(value)) return false;
  const overall = value.overall_scores;
  const metadata = value.interview_metadata;
  if (!isRecord(overall) || !isRecord(overall.dimensions) || !isRecord(metadata)) return false;

  const dimensions = overall.dimensions;
  const dimensionKeys = [
    'concrete_example',
    'situation_action_result',
    'link_to_job',
    'quantifiable_outcome',
  ];
  const validDimensions = dimensionKeys.every((key) => typeof dimensions[key] === 'number');
  const validQuestionScores = Array.isArray(value.per_question_scores)
    && value.per_question_scores.every((item) => {
      if (!isRecord(item) || !isRecord(item.scores)) return false;
      const scores = item.scores;
      // Accept both new schema (feedback object) and legacy (answer_summary string)
      const hasFeedback = isRecord(item.feedback)
        && typeof (item.feedback as Record<string, unknown>).strength === 'string'
        && typeof (item.feedback as Record<string, unknown>).improvement === 'string';
      const hasLegacySummary = typeof item.answer_summary === 'string';
      return typeof item.question_text === 'string'
        && (hasFeedback || hasLegacySummary)
        && dimensionKeys.every((key) => typeof scores[key] === 'number');
    });

  return validDimensions
    && typeof overall.total === 'number'
    && validQuestionScores
    && typeof value.question_count === 'number'
    && typeof value.readiness_label === 'string'
    && Array.isArray(value.strengths)
    && value.strengths.every((item) => typeof item === 'string')
    && Array.isArray(value.improvements)
    && value.improvements.every((item) => typeof item === 'string')
    && Array.isArray(value.contextual_advice)
    && value.contextual_advice.every((item) => typeof item === 'string')
    && typeof metadata.candidate_level === 'string'
    && typeof metadata.target_role === 'string'
    && (metadata.status === 'completed' || metadata.status === 'ended_early')
    && typeof metadata.completion_reason === 'string'
    && typeof metadata.main_questions_completed === 'number'
    && typeof metadata.follow_ups_completed === 'number'
    && typeof metadata.ended_early === 'boolean';
}
