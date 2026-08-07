/**
 * Agent 1 client — calls pdf_parser + analyst + interviewer Lambdas
 * to produce nova_sonic_context and competency_guides from resume + JD.
 */

import type { Agent1Response, CompetencyGuide } from '@/types/session';

export interface Agent1Request {
  pdf: File;
  jdText: string;
}

const PDF_PARSER_URL = import.meta.env.VITE_PDF_PARSER_URL;
const ANALYST_URL = import.meta.env.VITE_ANALYST_URL;
const INTERVIEWER_URL = import.meta.env.VITE_INTERVIEWER_URL;

/**
 * Calls the full pipeline: pdf_parser → analyst → interviewer.
 * Returns nova_sonic_context and competency_guides.
 */
export async function callAgent1(request: Agent1Request): Promise<Agent1Response> {
  // Step 1: Convert PDF to base64 and call pdf_parser
  const base64Pdf = await fileToBase64(request.pdf);

  const parseResponse = await fetch(PDF_PARSER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume: { content: base64Pdf, format: 'pdf' },
      job_posting: { content: request.jdText, format: 'text' },
    }),
  });

  const parseResult = await parseResponse.json();
  if (parseResult.status !== 'success') {
    throw new Error(`PDF parsing failed: ${parseResult.error}`);
  }

  const { resume_text, job_posting_text } = parseResult.data;

  // Step 2: Call analyst with extracted text
  const analystResponse = await fetch(ANALYST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume_text, job_posting_text }),
  });

  const analystResult = await analystResponse.json();
  if (analystResult.status !== 'success') {
    throw new Error(`Analysis failed: ${analystResult.error}`);
  }

  const analystOutput = analystResult.data;

  // Step 3: Call interviewer to get runtime context
  const interviewerResponse = await fetch(INTERVIEWER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analyst_output: analystOutput }),
  });

  const interviewerResult = await interviewerResponse.json();
  if (!interviewerResult.success) {
    throw new Error(`Interviewer setup failed: ${interviewerResult.error_message}`);
  }

  const novaSonicContext = interviewerResult.runtime_context
    || JSON.stringify(interviewerResult);

  // Step 4: Map analyst output to competency_guides for the UI
  const competencyGuides: CompetencyGuide[] = mapToCompetencyGuides(analystOutput);

  return {
    nova_sonic_context: novaSonicContext,
    competency_guides: competencyGuides,
    analyst_output: analystOutput,
  };
}

/**
 * Maps analyst_output.interview_plan to CompetencyGuide[] for the UI.
 */
function mapToCompetencyGuides(analystOutput: Record<string, unknown>): CompetencyGuide[] {
  const plan = (analystOutput.interview_plan || []) as Array<{
    topic: string;
    priority: number;
    question_type: string;
    target_skill: string;
    source_experience_id: string | null;
  }>;

  return plan.map((item, index) => ({
    id: `cg-${index + 1}`,
    title: item.target_skill,
    keywords: [item.topic, item.question_type, item.target_skill],
    description: item.topic,
    highlighted: false,
  }));
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
