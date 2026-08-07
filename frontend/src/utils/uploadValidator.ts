const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPE = 'application/pdf';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): ValidationResult {
  if (file.type !== ALLOWED_MIME_TYPE) {
    return {
      valid: false,
      error: 'Only PDF files can be uploaded.',
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'The file size exceeds 4 MB.',
    };
  }

  return { valid: true };
}

export { MAX_FILE_SIZE, ALLOWED_MIME_TYPE };
