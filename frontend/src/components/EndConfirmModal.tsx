/**
 * EndConfirmModal — Confirmation dialog for ending the interview.
 * Shows a modal overlay asking the user to confirm or cancel interview termination.
 *
 * Validates: Requirements 4.3, 4.6
 */

export interface EndConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EndConfirmModal({ open, onConfirm, onCancel }: EndConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="end-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-confirm-title"
      data-testid="end-confirm-modal"
    >
      <div className="end-confirm-modal">
        <h2 id="end-confirm-title" className="end-confirm-modal__title">
          End the interview?
        </h2>
        <p className="end-confirm-modal__desc">
          Feedback will be generated based on the conversation so far.
        </p>
        <div className="end-confirm-modal__actions">
          <button
            className="end-confirm-modal__btn end-confirm-modal__btn--cancel"
            onClick={onCancel}
            type="button"
            data-testid="end-confirm-cancel"
          >
            Cancel
          </button>
          <button
            className="end-confirm-modal__btn end-confirm-modal__btn--confirm"
            onClick={onConfirm}
            type="button"
            data-testid="end-confirm-ok"
          >
            End
          </button>
        </div>
      </div>

      <style>{`
        .end-confirm-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .end-confirm-modal {
          background-color: var(--color-tile-bg, #1C1C1E);
          border: 1px solid var(--color-control-bar, #2C2C2E);
          border-radius: 12px;
          padding: 32px;
          max-width: 400px;
          width: 90%;
          text-align: center;
        }

        .end-confirm-modal__title {
          font-size: 18px;
          font-weight: 600;
          color: var(--color-text-primary, #FFFFFF);
          margin: 0 0 12px;
        }

        .end-confirm-modal__desc {
          font-size: 14px;
          color: var(--color-text-secondary, #A0A0A5);
          margin: 0 0 24px;
        }

        .end-confirm-modal__actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .end-confirm-modal__btn {
          padding: 10px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: opacity 0.2s;
        }

        .end-confirm-modal__btn:hover {
          opacity: 0.85;
        }

        .end-confirm-modal__btn--cancel {
          background-color: var(--color-control-bar, #2C2C2E);
          color: var(--color-text-primary, #FFFFFF);
          border: 1px solid var(--color-text-secondary, #A0A0A5);
        }

        .end-confirm-modal__btn--confirm {
          background-color: var(--color-error, #FF5C5C);
          color: var(--color-text-primary, #FFFFFF);
        }
      `}</style>
    </div>
  );
}
