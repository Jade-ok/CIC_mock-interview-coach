/**
 * Agent 1 client — calls pdf_parser + analyst + interviewer Lambdas
 * to produce nova_sonic_context and analyst_output from resume + JD.
 */

import type { Agent1Response } from '@/types/session';
import { API_ENDPOINTS } from '@/services/apiConfig';

export interface Agent1Request {
  pdf: File;
  jdText: string;
}

/**
 * Calls the full pipeline: pdf_parser → analyst → interviewer.
 * Returns nova_sonic_context and analyst_output.
 */
export async function callAgent1(
  request: Agent1Request,
  signal?: AbortSignal
): Promise<Agent1Response> {
  // Step 1: Convert PDF to base64 and call PDF Parser
  const base64Pdf = await fileToBase64(request.pdf);

  const parseResponse = await fetch(API_ENDPOINTS.pdfParser, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume: { content: base64Pdf, format: 'pdf' },
      job_posting: { content: request.jdText, format: 'text' },
    }),
    signal,
  });

  const parseResult = await parseResponse.json();
  if (parseResult.status !== 'success') {
    throw new Error(`PDF parsing failed: ${parseResult.error}`);
  }

  const { resume_text, job_posting_text } = parseResult.data;

  // Step 2: Call analyst with extracted text
  const analystResponse = await fetch(API_ENDPOINTS.analyst, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume_text, job_posting_text }),
    signal,
  });

  const analystResult = await analystResponse.json();
  if (analystResult.status !== 'success') {
    throw new Error(`Analysis failed: ${analystResult.error}`);
  }

  const analystOutput = analystResult.data;

  // Step 3: Call interviewer to get runtime context
  const interviewerResponse = await fetch(API_ENDPOINTS.interviewer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analyst_output: analystOutput }),
    signal,
  });

  const interviewerResult = await interviewerResponse.json();
  if (!interviewerResponse.ok || interviewerResult.success !== true) {
    throw new Error(
      `Interviewer setup failed: ${interviewerResult.error_message || interviewerResponse.statusText}`
    );
  }

  const novaSonicContext = interviewerResult.runtime_context;

  return {
    nova_sonic_context: novaSonicContext,
    analyst_output: analystOutput,
  };
}

/**
 * Converts a File object to a base64-encoded string (without data URI prefix).
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URI prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
