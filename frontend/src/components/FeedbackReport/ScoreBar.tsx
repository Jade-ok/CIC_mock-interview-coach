import './ScoreBar.css';

interface ScoreBarProps {
  score: number;
  maxScore?: number;
  size?: 'sm' | 'md';
  label?: string;
}

/** Map score to a color tier class for the filled segments. */
function getScoreTier(score: number): string {
  if (score >= 4) return 'score-bar--tier-high';
  if (score >= 3) return 'score-bar--tier-mid';
  if (score >= 2) return 'score-bar--tier-low';
  return 'score-bar--tier-minimal';
}

export function ScoreBar({ score, maxScore = 5, size = 'md', label }: ScoreBarProps) {
  const segments = Array.from({ length: maxScore }, (_, i) => {
    const fillRatio = Math.min(1, Math.max(0, score - i));
    return fillRatio;
  });

  const ariaLabel = label
    ? `${label}: ${score.toFixed(1)} out of ${maxScore}`
    : `Score: ${score.toFixed(1)} out of ${maxScore}`;

  const tierClass = getScoreTier(score);

  return (
    <div
      className={`score-bar score-bar--${size} ${tierClass}`}
      role="img"
      aria-label={ariaLabel}
    >
      {segments.map((fillRatio, i) => (
        <div key={i} className="score-bar__segment">
          <div
            className="score-bar__fill"
            style={{ width: `${fillRatio * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}
