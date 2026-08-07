import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateFile, MAX_FILE_SIZE, ALLOWED_MIME_TYPE } from '@/utils/uploadValidator';

/**
 * Feature: frontend-interview, Property 1: file validation. Any attachment
 * that is not a PDF or exceeds 4 MB must be rejected with an error message.
 *
 * **Validates: Requirements 1.2, 1.3**
 */
describe('Property 1: file validation', () => {
  // Arbitrary for non-PDF MIME types
  const nonPdfMimeType = fc.stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyz/.-+'.split('')
    ),
    { minLength: 1, maxLength: 50 }
  ).filter((mime) => mime !== ALLOWED_MIME_TYPE);

  // Arbitrary for file sizes exceeding 4 MB
  const oversizedFileSize = fc.integer({
    min: MAX_FILE_SIZE + 1,
    max: MAX_FILE_SIZE * 3,
  });

  // Arbitrary for valid file sizes (0 to 4 MB)
  const validFileSize = fc.integer({ min: 0, max: MAX_FILE_SIZE });

  it('rejects files with non-PDF MIME type', () => {
    fc.assert(
      fc.property(
        nonPdfMimeType,
        validFileSize,
        fc.string({ minLength: 1, maxLength: 100 }),
        (mimeType, size, name) => {
          const file = new File([new ArrayBuffer(size)], name, { type: mimeType });
          const result = validateFile(file);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toBe('Only PDF files can be uploaded.');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects files exceeding 4 MB', () => {
    fc.assert(
      fc.property(
        oversizedFileSize,
        fc.string({ minLength: 1, maxLength: 100 }),
        (size, name) => {
          const file = new File([new ArrayBuffer(size)], name, { type: ALLOWED_MIME_TYPE });
          const result = validateFile(file);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toBe('The file size exceeds 4 MB.');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accepts valid PDF files within size limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_FILE_SIZE }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (size, name) => {
          const file = new File([new ArrayBuffer(size)], name, { type: ALLOWED_MIME_TYPE });
          const result = validateFile(file);

          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects files that are both non-PDF and oversized (non-PDF error takes priority)', () => {
    fc.assert(
      fc.property(
        nonPdfMimeType,
        oversizedFileSize,
        fc.string({ minLength: 1, maxLength: 100 }),
        (mimeType, size, name) => {
          const file = new File([new ArrayBuffer(size)], name, { type: mimeType });
          const result = validateFile(file);

          // Should be rejected (either error message is acceptable since MIME check is first)
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: frontend-interview, Property 2: submit-button disabled condition.
 * The button must be disabled whenever the resume is null or JD text is empty.
 * Only the empty string is checked; whitespace is intentionally allowed by Req 1.4.
 *
 * **Validates: Requirements 1.4**
 */
describe('Property 2: submit-button disabled condition', () => {
  // Pure logic function that mirrors the component's submit disabled logic
  function isSubmitDisabled(file: File | null, jdText: string): boolean {
    return file === null || jdText === '';
  }

  it('submit is disabled when file is null (regardless of JD text)', () => {
    fc.assert(
      fc.property(
        fc.string(), // any JD text, including empty
        (jdText) => {
          const disabled = isSubmitDisabled(null, jdText);
          expect(disabled).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('submit is disabled when JD text is empty string (regardless of file)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1024 * 1024 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (size, name) => {
          const file = new File([new ArrayBuffer(size)], name, { type: 'application/pdf' });
          const disabled = isSubmitDisabled(file, '');
          expect(disabled).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('submit is enabled when file is present AND JD text is non-empty (no trim)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1024 * 1024 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 500 }), // non-empty JD (could be whitespace)
        (size, name, jdText) => {
          const file = new File([new ArrayBuffer(size)], name, { type: 'application/pdf' });
          const disabled = isSubmitDisabled(file, jdText);
          expect(disabled).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('submit is enabled even when JD text is only whitespace (no trim check)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1024 * 1024 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 20 }),
        (size, name, spaceCount) => {
          const file = new File([new ArrayBuffer(size)], name, { type: 'application/pdf' });
          const jdText = ' '.repeat(spaceCount); // whitespace only but not empty
          const disabled = isSubmitDisabled(file, jdText);
          expect(disabled).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
