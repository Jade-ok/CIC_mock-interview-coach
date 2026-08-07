import type { PerQuestionScore } from '../../types/evaluator';
import { QuestionCard } from './QuestionCard';
import './QuestionBreakdown.css';

interface QuestionBreakdownProps {
  questions: PerQuestionScore[];
  questionCount: number;
}

export function QuestionBreakdown({ questions, questionCount }: QuestionBreakdownProps) {
  return (
    <section className="question-breakdown">
      <h2 className="question-breakdown__title">Question by question</h2>
      <p className="question-breakdown__intro">
        You answered {questionCount} of 6 questions — you're scored only on what you answered, so ending early never counts against you.
      </p>
      {questions.map((q, i) => (
        <QuestionCard
          key={i}
          index={i + 1}
          turnType={i % 2 === 0 ? 'main_question' : 'follow_up'}
          questionText={q.question_text}
          answerSummary={q.answer_summary}
          scores={q.scores}
        />
      ))}
    </section>
  );
}
