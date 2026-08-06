import './FooterCTA.css';

interface FooterCTAProps {
  onPracticeAgain: () => void;
  onViewTranscript: () => void;
}

export function FooterCTA({ onPracticeAgain, onViewTranscript }: FooterCTAProps) {
  return (
    <footer className="footer-cta">
      <p className="footer-cta__message">
        Every practice round makes the real one easier.
      </p>
      <div className="footer-cta__actions">
        <button className="footer-cta__button footer-cta__button--primary" onClick={onPracticeAgain}>
          Practice again
        </button>
        <button className="footer-cta__button footer-cta__button--secondary" onClick={onViewTranscript}>
          View full transcript
        </button>
      </div>
    </footer>
  );
}
