import { useState } from 'react';
import './ContextualAdvice.css';

interface ContextualAdviceProps {
  advice: string[];
}

const VISIBLE_COUNT = 2;

export function ContextualAdvice({ advice }: ContextualAdviceProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = advice.length > VISIBLE_COUNT;
  const visibleItems = expanded ? advice : advice.slice(0, VISIBLE_COUNT);

  return (
    <section className="contextual-advice">
      <h2 className="contextual-advice__heading">For your next interview</h2>
      <p className="contextual-advice__subheading">
        Advice based on your resume and the job you're aiming for.
      </p>
      <ol className="contextual-advice__list">
        {visibleItems.map((item, i) => (
          <li key={i} className="contextual-advice__item">{item}</li>
        ))}
      </ol>
      {hasMore && (
        <button
          type="button"
          className="contextual-advice__toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : `Show ${advice.length - VISIBLE_COUNT} more`}
        </button>
      )}
    </section>
  );
}
