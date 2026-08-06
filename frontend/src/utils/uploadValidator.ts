const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPE = 'application/pdf';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): ValidationResult {
  if (file.type !== ALLOWED_MIME_TYPE) {
    return {
      valid: false,
      error: 'PDF 파일만 업로드할 수 있습니다.',
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: '파일 크기가 10MB를 초과합니다.',
    };
  }

  return { valid: true };
}

export { MAX_FILE_SIZE, ALLOWED_MIME_TYPE };
