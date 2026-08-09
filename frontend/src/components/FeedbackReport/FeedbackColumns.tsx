import './FeedbackColumns.css';

interface FeedbackColumnsProps {
  strengths: string[];
  improvements: string[];
}

/**
 * Overall Summary section — combines strengths and improvements into
 * a concise summary paragraph instead of two separate lists.
 */
export function FeedbackColumns({ strengths, improvements }: FeedbackColumnsProps) {
  // Combine into a single summary block — 1 strength + 1 improvement for brevity
  const summary = [strengths[0], improvements[0]].filter(Boolean);

  return (
    <section className="feedback-summary">
      <h2 className="feedback-summary__heading">Overall Summary</h2>
      <div className="feedback-summary__body">
        {summary.map((sentence, i) => (
          <p key={i} className="feedback-summary__sentence">{sentence}</p>
        ))}
      </div>
    </section>
  );
}
