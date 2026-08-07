import type { EvaluatorOutput } from '../../types/evaluator';
import { HeroSection } from './HeroSection';
import { DimensionScoresGrid } from './DimensionScoresGrid';
import { FeedbackColumns } from './FeedbackColumns';
import { ContextualAdvice } from './ContextualAdvice';
import { QuestionBreakdown } from './QuestionBreakdown';
import { FooterCTA } from './FooterCTA';
import './feedback-theme.css';
import './FeedbackReport.css';

interface FeedbackReportProps {
  data: EvaluatorOutput;
  onPracticeAgain: () => void;
  onViewTranscript?: () => void;
}

export function FeedbackReport({ data, onPracticeAgain, onViewTranscript }: FeedbackReportProps) {
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
        />

        <DimensionScoresGrid dimensions={data.overall_scores.dimensions} />

        <FeedbackColumns
          strengths={data.strengths}
          improvements={data.improvements}
        />

        <ContextualAdvice advice={data.contextual_advice} />

        <QuestionBreakdown
          questions={data.per_question_scores}
          questionCount={data.question_count}
        />
      </main>

      <FooterCTA
        onPracticeAgain={onPracticeAgain}
        onViewTranscript={onViewTranscript}
      />
    </div>
  );
}
