import { useState } from 'react';
import type { PerQuestionScore } from '../../types/evaluator';
import type { TranscriptEntry } from '../../types/session';
import { QuestionCard } from './QuestionCard';
import './QuestionBreakdown.css';

interface QuestionBreakdownProps {
  questions: PerQuestionScore[];
  questionCount: number;
  transcript?: TranscriptEntry[];
}

/**
 * Merge consecutive same-role transcript entries and pair them into Q&A turns.
 * Mirrors the logic in agent3Client.ts mergeConsecutiveEntries + pairConversation.
 */
function buildTranscriptPairs(transcript: TranscriptEntry[]): Array<{ question: string; answer: string }> {
  if (!transcript || transcript.length === 0) return [];

  // Merge consecutive same-role entries
  const merged: TranscriptEntry[] = [];
  let current = { ...transcript[0] };
  for (let i = 1; i < transcript.length; i++) {
    const entry = transcript[i];
    if (entry.role === current.role) {
      current = { ...current, text: current.text + ' ' + entry.text };
    } else {
      merged.push(current);
      current = { ...entry };
    }
  }
  merged.push(current);

  // Pair interviewer → user
  const pairs: Array<{ question: string; answer: string }> = [];
  let pendingQuestion: string | null = null;
  for (const entry of merged) {
    if (entry.role === 'interviewer') {
      pendingQuestion = entry.text;
      continue;
    }
    if (pendingQuestion) {
      pairs.push({ question: pendingQuestion, answer: entry.text });
      pendingQuestion = null;
    }
  }
  return pairs;
}

export function QuestionBreakdown({ questions, questionCount, transcript }: QuestionBreakdownProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptPairs = transcript ? buildTranscriptPairs(transcript) : [];
  const hasTranscript = transcriptPairs.length > 0;

  return (
    <section className="question-breakdown">
      <div className="question-breakdown__header">
        <div>
          <h2 className="question-breakdown__title">Question by question</h2>
          <p className="question-breakdown__intro">
            You answered {questionCount} question{questionCount !== 1 ? 's' : ''} — you're scored only on what you answered, so ending early never counts against you.
          </p>
        </div>
        {hasTranscript && (
          <button
            type="button"
            className="question-breakdown__transcript-toggle"
            onClick={() => setShowTranscript((prev) => !prev)}
            aria-expanded={showTranscript}
          >
            {showTranscript ? 'Hide transcript' : 'Show my answers'}
          </button>
        )}
      </div>

      {questions.map((q, i) => (
        <QuestionCard
          key={i}
          index={i + 1}
          questionText={q.question_text}
          feedback={q.feedback}
          scores={q.scores}
          fullAnswer={showTranscript ? transcriptPairs[i]?.answer : undefined}
        />
      ))}
    </section>
  );
}
