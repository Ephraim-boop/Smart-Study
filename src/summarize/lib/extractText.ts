import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves the worker as a separate URL asset (see vite/client types).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { DOCX_MIME, type UploadedNote } from '../../upload/types';

/**
 * Client-side text extraction for Smart Summarize.
 *
 * Runs entirely in the browser so the raw file never has to be uploaded just to
 * read it — we send only the extracted text to the secure backend.
 *
 * Supported: PDF (pdfjs-dist), Word .docx (mammoth) and plain text/Markdown.
 * Images (camera / photo) need OCR and are reported as such rather than being
 * guessed at — the spec forbids fabricated summaries.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Cap extracted characters sent to the AI (keeps requests within model limits). */
export const MAX_EXTRACTED_CHARS = 40_000;

/**
 * Hard ceiling for the text of ONE generation request. Several long notes can
 * easily exceed what the backend accepts, and that used to arrive as a
 * "too large" failure after the student had waited through the whole upload.
 * The combined text is trimmed to this and the student is told it happened.
 */
export const MAX_REQUEST_CHARS = 55_000;

/**
 * Why a document could not be read. Kept as codes so the UI can name the cause
 * (and translate it) instead of printing one generic sentence.
 */
export type ExtractionFailureCode = 'empty_text' | 'unsupported_format';

export type ExtractionResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; code: ExtractionFailureCode; reason: string };

function isPdfFile(note: UploadedNote): boolean {
  return note.mime === 'application/pdf' || note.name.toLowerCase().endsWith('.pdf');
}

function isDocxFile(note: UploadedNote): boolean {
  return note.mime === DOCX_MIME || note.name.toLowerCase().endsWith('.docx');
}

function isTextFile(note: UploadedNote): boolean {
  return (
    note.mime === 'text/plain' ||
    note.mime === 'text/markdown' ||
    /\.(txt|md)$/i.test(note.name)
  );
}

function isImageFile(note: UploadedNote): boolean {
  return note.mime.startsWith('image/');
}

async function extractPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .filter(Boolean);
    pages.push(strings.join(' '));
  }
  // Collapse whitespace but keep paragraph-ish breaks.
  return pages.join('\n\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Word document -> plain text. The browser build is loaded only when needed. */
async function extractDocx(file: File): Promise<string> {
  const mod = await import('mammoth/mammoth.browser.js');
  const mammoth = ((mod as { default?: unknown }).default ?? mod) as {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value?: string }>;
  };
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return String(result?.value ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract readable text from a single uploaded note. Returns a tagged result so
 * the caller can show a precise, honest message when a file has no text.
 */
export async function extractNoteText(note: UploadedNote): Promise<ExtractionResult> {
  if (isTextFile(note)) {
    const raw = (await note.file.text()).trim();
    if (!raw) {
      return { ok: false, code: 'empty_text', reason: `"${note.name}" is empty — there is no text to summarize.` };
    }
    return finalize(raw);
  }

  if (isPdfFile(note)) {
    let text: string;
    try {
      text = await extractPdf(note.file);
    } catch {
      return {
        ok: false,
        code: 'empty_text',
        reason: `"${note.name}" could not be read. It may be a scanned/image PDF — those need OCR, which isn't supported yet.`,
      };
    }
    if (!text) {
      return {
        ok: false,
        code: 'empty_text',
        reason: `"${note.name}" contains no selectable text (likely a scanned document). OCR is not supported yet.`,
      };
    }
    return finalize(text);
  }

  if (isDocxFile(note)) {
    let text: string;
    try {
      text = await extractDocx(note.file);
    } catch {
      return {
        ok: false,
        code: 'empty_text',
        reason: `"${note.name}" could not be read as a Word document. If it is an older .doc file, save it as .docx or PDF and upload again.`,
      };
    }
    if (!text) {
      return {
        ok: false,
        code: 'empty_text',
        reason: `"${note.name}" has no readable text — it looks like a Word file made of pictures. OCR is not supported yet.`,
      };
    }
    return finalize(text);
  }

  if (isImageFile(note)) {
    return {
      ok: false,
      code: 'unsupported_format',
      reason: `Image notes ("${note.name}") can't be summarized yet — text extraction from photos (OCR) isn't available. Upload a PDF, Word .docx or text file.`,
    };
  }

  return {
    ok: false,
    code: 'unsupported_format',
    reason: `"${note.name}" isn't a supported format for summarizing yet. Supported: PDF, Word .docx, TXT and Markdown.`,
  };
}

function finalize(text: string): ExtractionResult {
  const truncated = text.length > MAX_EXTRACTED_CHARS;
  const clipped = truncated ? text.slice(0, MAX_EXTRACTED_CHARS) : text;
  return { ok: true, text: clipped, truncated };
}

/**
 * Join the extracted text of several notes so the combined request always fits
 * what the backend accepts. Reports which notes had to be trimmed.
 */
export function combineExtracted(
  pieces: { name: string; text: string; truncated: boolean }[],
): { text: string; notes: string[] } {
  const notes: string[] = [];
  let body = pieces
    .map((p) => `--- Source: ${p.name} ---\n${p.text}`)
    .join('\n\n');
  pieces.filter((p) => p.truncated).forEach((p) => notes.push(`"${p.name}" was very long and got trimmed.`));

  if (body.length > MAX_REQUEST_CHARS) {
    body = body.slice(0, MAX_REQUEST_CHARS);
    notes.push(
      `Together these notes were longer than ${MAX_REQUEST_CHARS.toLocaleString()} characters, so the end was cut off. Try summarizing fewer notes at a time.`,
    );
  }
  return { text: body, notes };
}

/** True when Smart Summarize can currently read this note. */
export function isSummarizable(note: UploadedNote): boolean {
  return isPdfFile(note) || isDocxFile(note) || isTextFile(note);
}
