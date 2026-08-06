import { ScoreBar } from './ScoreBar';
import { DIMENSION_LABELS, DIMENSION_KEYS } from '../../utils/dimensionLabels';
import type { PerQuestionScore } from '../../types/evaluator';
import './QuestionCard.css';

interface QuestionCardProps {
  index: number;
  turnType: string;
  questionText: string;
  answerSummary: string;
  scores: PerQuestionScore['scores'];
}

export function QuestionCard({ index, turnType, questionText, answerSummary, scores }: QuestionCardProps) {
  const badgeLabel = turnType === 'main_question' ? 'Main question' : 'Follow-up';
  const badgeClass = turnType === 'main_question' ? 'question-card__badge--main' : 'question-card__badge--followup';

  return (
    <article className="question-card">
      <div className="question-card__header">
        <span className="question-card__number">Q{index}</span>
        <span className={`question-card__badge ${badgeClass}`}>{badgeLabel}</span>
      </div>
      <h3 className="question-card__question">{questionText}</h3>
      <p className="question-card__answer">{answerSummary}</p>
      <div className="question-card__scores">
        {DIMENSION_KEYS.map((key) => (
          <div key={key} className="question-card__score-row">
            <span className="question-card__dimension-label">
              {DIMENSION_LABELS[key].label}
            </span>
            <ScoreBar
              score={scores[key as keyof typeof scores]}
              size="sm"
              label={DIMENSION_LABELS[key].label}
            />
          </div>
        ))}
      </div>
    </article>
  );
}
