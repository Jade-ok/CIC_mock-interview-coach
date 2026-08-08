import './KeywordCoverage.css';

interface KeywordCoverageProps {
  covered: string[];
  notCovered: string[];
}

export function KeywordCoverage({ covered, notCovered }: KeywordCoverageProps) {
  if (covered.length === 0 && notCovered.length === 0) return null;

  return (
    <section className="keyword-coverage">
      <h2 className="keyword-coverage__heading">Keyword coverage</h2>
      <p className="keyword-coverage__subheading">
        Skills from the job description you mentioned during the interview.
      </p>
      <div className="keyword-coverage__grid">
        {covered.map((kw, i) => (
          <span key={`c-${i}`} className="keyword-coverage__chip keyword-coverage__chip--covered">
            <span className="keyword-coverage__check" aria-hidden="true">&#10003;</span>
            {kw}
          </span>
        ))}
        {notCovered.map((kw, i) => (
          <span key={`n-${i}`} className="keyword-coverage__chip keyword-coverage__chip--missed">
            {kw}
          </span>
        ))}
      </div>
    </section>
  );
}
