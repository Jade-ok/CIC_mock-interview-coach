import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EndConfirmModal } from '@/components/EndConfirmModal';

describe('EndConfirmModal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <EndConfirmModal open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with correct message when open', () => {
    render(
      <EndConfirmModal open={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('End the interview?')).toBeInTheDocument();
  });

  it('has role="dialog" and aria-modal="true"', () => {
    render(
      <EndConfirmModal open={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'end-confirm-title');
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <EndConfirmModal open={true} onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    fireEvent.click(screen.getByTestId('end-confirm-ok'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <EndConfirmModal open={true} onConfirm={vi.fn()} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByTestId('end-confirm-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows confirm and cancel buttons with correct labels', () => {
    render(
      <EndConfirmModal open={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('End')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
