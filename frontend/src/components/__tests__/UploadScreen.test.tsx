import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UploadScreen } from '@/components/UploadScreen';

function createMockFile(
  name: string,
  size: number,
  type: string
): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('UploadScreen', () => {
  describe('FileUploader', () => {
    it('displays filename when a valid PDF is selected via file input', async () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('resume.pdf')).toBeInTheDocument();
    });

    it('displays filename when a valid PDF is dropped', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const dropzone = screen.getByRole('button', {
        name: /Drag and drop a PDF file or click to select/,
      });

      const file = createMockFile('dropped.pdf', 2048, 'application/pdf');
      const dataTransfer = { files: [file] };

      fireEvent.drop(dropzone, { dataTransfer });

      expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
    });

    it('shows error for non-PDF file type', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      const file = createMockFile('image.png', 1024, 'image/png');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('Only PDF files can be uploaded.')).toBeInTheDocument();
    });

    it('shows error for file exceeding 10 MB', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      const file = createMockFile(
        'big.pdf',
        11 * 1024 * 1024,
        'application/pdf'
      );

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('The file size exceeds 10 MB.')).toBeInTheDocument();
    });

    it('clears error when a valid file is selected after an invalid one', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;

      // First select invalid file
      const invalidFile = createMockFile('doc.txt', 1024, 'text/plain');
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });
      expect(screen.getByText('Only PDF files can be uploaded.')).toBeInTheDocument();

      // Then select valid file
      const validFile = createMockFile('resume.pdf', 1024, 'application/pdf');
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      expect(screen.queryByText('Only PDF files can be uploaded.')).not.toBeInTheDocument();
      expect(screen.getByText('resume.pdf')).toBeInTheDocument();
    });
  });

  describe('JDTextarea', () => {
    it('renders a textarea for JD input', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const textarea = screen.getByPlaceholderText('Paste the job description here');
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('allows text input', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const textarea = screen.getByPlaceholderText('Paste the job description here');
      fireEvent.change(textarea, { target: { value: 'Frontend Engineer' } });

      expect(textarea).toHaveValue('Frontend Engineer');
    });
  });

  describe('SubmitButton', () => {
    it('is disabled when no file is selected', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const textarea = screen.getByPlaceholderText('Paste the job description here');
      fireEvent.change(textarea, { target: { value: 'some JD' } });

      const button = screen.getByRole('button', { name: 'Submit' });
      expect(button).toBeDisabled();
    });

    it('is disabled when JD text is empty string', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      fireEvent.change(fileInput, { target: { files: [file] } });

      const button = screen.getByRole('button', { name: 'Submit' });
      expect(button).toBeDisabled();
    });

    it('is enabled when both file and JD text are provided', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      fireEvent.change(fileInput, { target: { files: [file] } });

      const textarea = screen.getByPlaceholderText('Paste the job description here');
      fireEvent.change(textarea, { target: { value: 'JD text' } });

      const button = screen.getByRole('button', { name: 'Submit' });
      expect(button).not.toBeDisabled();
    });

    it('is enabled when JD is whitespace-only (no trim check)', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      fireEvent.change(fileInput, { target: { files: [file] } });

      const textarea = screen.getByPlaceholderText('Paste the job description here');
      fireEvent.change(textarea, { target: { value: '   ' } });

      const button = screen.getByRole('button', { name: 'Submit' });
      expect(button).not.toBeDisabled();
    });

    it('calls onSubmit with file and JD text when clicked', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      fireEvent.change(fileInput, { target: { files: [file] } });

      const textarea = screen.getByPlaceholderText('Paste the job description here');
      fireEvent.change(textarea, { target: { value: 'My JD' } });

      const button = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith(file, 'My JD');
    });

    it('does not call onSubmit when disabled', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const button = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(button);

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('drag and drop interaction', () => {
    it('shows dragover visual state on dragOver', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const dropzone = screen.getByRole('button', {
        name: /Drag and drop a PDF file or click to select/,
      });

      fireEvent.dragOver(dropzone);

      expect(dropzone.className).toContain('dragover');
    });

    it('removes dragover visual state on dragLeave', () => {
      const onSubmit = vi.fn();
      render(<UploadScreen onSubmit={onSubmit} />);

      const dropzone = screen.getByRole('button', {
        name: /Drag and drop a PDF file or click to select/,
      });

      fireEvent.dragOver(dropzone);
      fireEvent.dragLeave(dropzone);

      expect(dropzone.className).not.toContain('dragover');
    });
  });
});
