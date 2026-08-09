import type { EvaluatorOutput } from '../../types/evaluator';
import type { TranscriptEntry } from '../../types/session';
import { HeroSection } from './HeroSection';
import { DimensionScoresGrid } from './DimensionScoresGrid';
import { FeedbackColumns } from './FeedbackColumns';
import { KeywordCoverage } from './KeywordCoverage';
import { ContextualAdvice } from './ContextualAdvice';
import { QuestionBreakdown } from './QuestionBreakdown';
import { FooterCTA } from './FooterCTA';
import './feedback-theme.css';
import './FeedbackReport.css';

interface FeedbackReportProps {
  data: EvaluatorOutput;
  onPracticeAgain: () => void;
  onViewTranscript?: () => void;
  transcript?: TranscriptEntry[];
}

export function FeedbackReport({ data, onPracticeAgain, onViewTranscript, transcript }: FeedbackReportProps) {
  return (
    <div className="feedback-report">
      <header className="feedback-report__header">
        <span className="feedback-report__brand">CIC Mock Interview Coach</span>
        <nav className="feedback-report__nav">
          {onViewTranscript && (
            <button type="button" className="feedback-report__nav-link" onClick={onViewTranscript}>
              View full transcript
            </button>
          )}
          <button type="button" className="feedback-report__nav-link feedback-report__nav-link--primary" onClick={onPracticeAgain}>
            Practice again
          </button>
        </nav>
      </header>

      <main className="feedback-report__content">
        <HeroSection
          readinessLabel={data.readiness_label}
          totalScore={data.overall_scores.total}
          questionCount={data.question_count}
          targetRole={data.interview_metadata.target_role}
          dimensions={data.overall_scores.dimensions}
        />

        <DimensionScoresGrid dimensions={data.overall_scores.dimensions} perQuestionScores={data.per_question_scores} />

        <FeedbackColumns
          strengths={data.strengths}
          improvements={data.improvements}
        />

        <KeywordCoverage
          covered={data.keywords_covered || []}
          notCovered={data.keywords_not_covered || []}
        />

        <QuestionBreakdown
          questions={data.per_question_scores}
          questionCount={data.question_count}
          transcript={transcript}
        />

        <ContextualAdvice advice={data.contextual_advice} />
      </main>

      <FooterCTA
        onPracticeAgain={onPracticeAgain}
        onViewTranscript={onViewTranscript}
      />
    </div>
  );
}
