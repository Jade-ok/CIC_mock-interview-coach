export interface PerQuestionScore {
  question_text: string;
  answer_summary: string;
  scores: {
    concrete_example: number;
    situation_action_result: number;
    link_to_job: number;
    quantifiable_outcome: number;
  };
}

export interface OverallScores {
  dimensions: {
    concrete_example: number;
    situation_action_result: number;
    link_to_job: number;
    quantifiable_outcome: number;
  };
  total: number;
}

export interface InterviewMetadata {
  candidate_level: string;
  target_role: string;
  status: 'completed' | 'ended_early';
  completion_reason: string;
  main_questions_completed: number;
  follow_ups_completed: number;
  ended_early: boolean;
}

export interface EvaluatorOutput {
  per_question_scores: PerQuestionScore[];
  overall_scores: OverallScores;
  question_count: number;
  readiness_label: string;
  strengths: string[];
  improvements: string[];
  contextual_advice: string[];
  interview_metadata: InterviewMetadata;
}
