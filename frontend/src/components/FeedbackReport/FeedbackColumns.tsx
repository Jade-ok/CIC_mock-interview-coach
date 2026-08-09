import './FeedbackColumns.css';

interface FeedbackColumnsProps {
  strengths: string[];
  improvements: string[];
}

/**
 * Overall Summary section — combines strengths and improvements into
 * a concise 3-4 sentence paragraph instead of two separate lists.
 */
export function FeedbackColumns({ strengths, improvements }: FeedbackColumnsProps) {
  // Take the top items from each to build a brief summary
  const topStrength = strengths[0] || '';
  const secondStrength = strengths[1] || '';
  const topImprovement = improvements[0] || '';
  const secondImprovement = improvements[1] || '';

  // Build summary sentences
  const sentences: string[] = [];
  if (topStrength) sentences.push(topStrength);
  if (secondStrength) sentences.push(secondStrength);
  if (topImprovement) sentences.push(topImprovement);
  if (secondImprovement) sentences.push(secondImprovement);

  // Limit to 4 sentences max
  const summary = sentences.slice(0, 4);

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
