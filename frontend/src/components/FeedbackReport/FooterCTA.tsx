import './FooterCTA.css';

interface FooterCTAProps {
  onPracticeAgain: () => void;
  onNewSession: () => void;
  onViewTranscript?: () => void;
}

export function FooterCTA({ onPracticeAgain, onNewSession, onViewTranscript }: FooterCTAProps) {
  return (
    <footer className="footer-cta">
      <p className="footer-cta__message">
        Every practice round makes the real one easier.
      </p>
      <div className="footer-cta__actions">
        <button type="button" className="footer-cta__button footer-cta__button--primary" onClick={onPracticeAgain}>
          Retry with This Resume
        </button>
        <button type="button" className="footer-cta__button footer-cta__button--secondary" onClick={onNewSession}>
          Retry with New Resume
        </button>
        {onViewTranscript && (
          <button type="button" className="footer-cta__button footer-cta__button--tertiary" onClick={onViewTranscript}>
            View full transcript
          </button>
        )}
      </div>
    </footer>
  );
}
