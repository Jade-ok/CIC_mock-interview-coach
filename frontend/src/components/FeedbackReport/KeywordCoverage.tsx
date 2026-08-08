import './KeywordCoverage.css';

interface KeywordCoverageProps {
  covered: string[];
  notCovered: string[];
}

export function KeywordCoverage({ covered, notCovered }: KeywordCoverageProps) {
  const total = covered.length + notCovered.length;
  if (total === 0) return null;

  return (
    <section className="keyword-coverage">
      <div className="keyword-coverage__header">
        <div>
          <h2 className="keyword-coverage__heading">Role requirements you covered</h2>
          <p className="keyword-coverage__subheading">
            Key skills from the job description — which ones your answers touched.
          </p>
        </div>
        <span className="keyword-coverage__counter">
          {covered.length} of {total} covered
        </span>
      </div>
      <div className="keyword-coverage__grid">
        {covered.map((kw, i) => (
          <span key={`c-${i}`} className="keyword-coverage__chip keyword-coverage__chip--covered">
            <span className="keyword-coverage__icon" aria-hidden="true">&#10003;</span>
            {kw}
          </span>
        ))}
      </div>
      {notCovered.length > 0 && (
        <div className="keyword-coverage__grid keyword-coverage__grid--missed">
          {notCovered.map((kw, i) => (
            <span key={`n-${i}`} className="keyword-coverage__chip keyword-coverage__chip--missed">
              <span className="keyword-coverage__icon" aria-hidden="true">&#9675;</span>
              {kw}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
