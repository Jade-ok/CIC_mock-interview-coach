import React, { useState, useCallback, useRef } from 'react';
import { validateFile } from '@/utils/uploadValidator';

export interface UploadScreenProps {
  onSubmit: (pdf: File, jdText: string) => void;
}

export function UploadScreen({ onSubmit }: UploadScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileValidation = useCallback((selectedFile: File) => {
    const result = validateFile(selectedFile);
    if (!result.valid) {
      setError(result.error ?? null);
      setFile(null);
    } else {
      setError(null);
      setFile(selectedFile);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFileValidation(selectedFile);
      }
    },
    [handleFileValidation]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileValidation(droppedFile);
      }
    },
    [handleFileValidation]
  );

  const handleDropZoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleSubmit = useCallback(() => {
    if (file && jdText !== '') {
      onSubmit(file, jdText);
    }
  }, [file, jdText, onSubmit]);

  const isSubmitDisabled = file === null || jdText === '';

  return (
    <div className="upload-screen">
      <h1 className="upload-screen__title">AI Mock Interview Coach</h1>

      <div className="upload-screen__content">
        {/* FileUploader */}
        <div className="upload-screen__section">
          <label className="upload-screen__label">Resume (PDF)</label>
          <div
            className={`upload-screen__dropzone ${isDragOver ? 'upload-screen__dropzone--dragover' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleDropZoneClick}
            role="button"
            tabIndex={0}
            aria-label="Drag and drop a PDF file or click to select"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="upload-screen__file-input"
              data-testid="file-input"
              aria-hidden="true"
            />
            {file ? (
              <p className="upload-screen__filename">{file.name}</p>
            ) : (
              <p className="upload-screen__placeholder">
                Drag and drop a PDF file or click to select
              </p>
            )}
          </div>
          {error && (
            <p className="upload-screen__error" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* JDTextarea */}
        <div className="upload-screen__section">
          <label className="upload-screen__label" htmlFor="jd-textarea">
            Job Description (JD)
          </label>
          <textarea
            id="jd-textarea"
            className="upload-screen__textarea"
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the job description here"
            rows={8}
          />
        </div>

        {/* SubmitButton */}
        <button
          className="upload-screen__submit"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          type="button"
        >
          Submit
        </button>
      </div>

      <style>{`
        .upload-screen {
          min-height: 100vh;
          background-color: var(--color-canvas, #0A0A0A);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 48px 24px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .upload-screen__title {
          color: var(--color-text-primary, #FFFFFF);
          font-size: 28px;
          font-weight: 600;
          margin-bottom: 40px;
        }

        .upload-screen__content {
          width: 100%;
          max-width: 560px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .upload-screen__section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .upload-screen__label {
          color: var(--color-text-primary, #FFFFFF);
          font-size: 14px;
          font-weight: 500;
        }

        .upload-screen__dropzone {
          background-color: var(--color-tile-bg, #1C1C1E);
          border: 2px dashed var(--color-text-secondary, #A0A0A5);
          border-radius: 8px;
          padding: 32px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.2s, background-color 0.2s;
        }

        .upload-screen__dropzone:hover,
        .upload-screen__dropzone--dragover {
          border-color: var(--color-accent, #9AE05C);
          background-color: rgba(154, 224, 92, 0.05);
        }

        .upload-screen__file-input {
          display: none;
        }

        .upload-screen__filename {
          color: var(--color-accent, #9AE05C);
          font-size: 14px;
          margin: 0;
        }

        .upload-screen__placeholder {
          color: var(--color-text-secondary, #A0A0A5);
          font-size: 14px;
          margin: 0;
        }

        .upload-screen__error {
          color: var(--color-error, #FF5C5C);
          font-size: 13px;
          margin: 0;
        }

        .upload-screen__textarea {
          background-color: var(--color-tile-bg, #1C1C1E);
          border: 1px solid var(--color-text-secondary, #A0A0A5);
          border-radius: 8px;
          padding: 12px;
          color: var(--color-text-primary, #FFFFFF);
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
          min-height: 120px;
        }

        .upload-screen__textarea:focus {
          outline: none;
          border-color: var(--color-accent, #9AE05C);
        }

        .upload-screen__textarea::placeholder {
          color: var(--color-text-secondary, #A0A0A5);
        }

        .upload-screen__submit {
          background-color: var(--color-accent, #9AE05C);
          color: var(--color-canvas, #0A0A0A);
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .upload-screen__submit:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .upload-screen__submit:not(:disabled):hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
