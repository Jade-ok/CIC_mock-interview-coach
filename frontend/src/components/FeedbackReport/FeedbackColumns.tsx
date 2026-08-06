import './FeedbackColumns.css';

interface FeedbackColumnsProps {
  strengths: string[];
  improvements: string[];
}

export function FeedbackColumns({ strengths, improvements }: FeedbackColumnsProps) {
  return (
    <section className="feedback-columns">
      <div className="feedback-columns__column">
        <h2 className="feedback-columns__heading">What you did well</h2>
        {strengths.map((item, i) => (
          <p key={i} className="feedback-columns__strength">{item}</p>
        ))}
      </div>
      <div className="feedback-columns__column">
        <h2 className="feedback-columns__heading">What to work on next</h2>
        <ul className="feedback-columns__list">
          {improvements.map((item, i) => (
            <li key={i} className="feedback-columns__improvement">{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
