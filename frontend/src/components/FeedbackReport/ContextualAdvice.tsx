import './ContextualAdvice.css';

interface ContextualAdviceProps {
  advice: string[];
}

export function ContextualAdvice({ advice }: ContextualAdviceProps) {
  return (
    <section className="contextual-advice">
      <h2 className="contextual-advice__heading">For your next interview</h2>
      <p className="contextual-advice__subheading">
        Advice based on your resume and the job you're aiming for.
      </p>
      <ol className="contextual-advice__list">
        {advice.map((item, i) => (
          <li key={i} className="contextual-advice__item">{item}</li>
        ))}
      </ol>
    </section>
  );
}
