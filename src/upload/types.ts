/**
 * Note-upload types + validation (StudySmart "Upload your notes").
 *
 * Validation runs on the client for immediate feedback, but the brief (§13)
 * requires the same checks on the server before storage / AI processing —
 * this module is the shared source of truth for the accepted set.
 */

export type NoteSource = 'camera' | 'pdf' | 'photo';

export interface UploadedNote {
  id: string;
  file: File;
  name: string;
  size: number;
  mime: string;
  source: NoteSource;
  /** Object URL for image thumbnails (revoked on remove/unmount). */
  previewUrl: string | null;
  addedAt: number;
}

/** Max accepted file size in bytes (15 MB). */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Accepted MIME types: PDF + common images + the text formats we can read. */
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const ACCEPTED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  DOCX_MIME,
  'text/plain',
  'text/markdown',
] as const;

/** `accept` attribute strings for the file inputs. */
export const DOCUMENT_ACCEPT = 'application/pdf,.pdf,.docx,.txt,.md';
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';

/**
 * Extensions we can extract text from. Browsers sometimes report an empty or
 * wrong MIME type for .docx/.txt picked from disk, so validation and text
 * extraction also look at the name, from one shared place.
 */
export const TEXT_FILE_EXTENSIONS = ['.docx', '.txt', '.md'] as const;

export function hasKnownExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return isPdfName(lower) || TEXT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext)) || /\.(png|jpe?g|webp|heic)$/i.test(lower);
}

function isPdfName(lowerName: string): boolean {
  return lowerName.endsWith('.pdf');
}

/** Best-effort MIME type: trust the browser, fall back to the extension. */
export function guessMime(name: string, declaredType: string): string {
  const type = (declaredType || '').trim().toLowerCase();
  if (type && type !== 'application/octet-stream') return type;
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return DOCX_MIME;
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (/\.(png)$/.test(lower)) return 'image/png';
  if (/\.jpe?g$/.test(lower)) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return type || '';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/** Validate a single file against the accepted type + size policy. */
export function validateNoteFile(file: File): ValidationResult {
  const declared = guessMime(file.name, file.type);
  const typeOk =
    (ACCEPTED_MIME as readonly string[]).includes(declared) || hasKnownExtension(file.name);
  if (!typeOk) {
    return {
      ok: false,
      reason:
        'Unsupported file type. Upload a PDF, a Word .docx file, a text/Markdown file, or an image (PNG, JPG, WEBP).',
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: `File is too large (${formatBytes(file.size)}). Maximum is ${formatBytes(MAX_FILE_BYTES)}.` };
  }
  if (file.size === 0) {
    return { ok: false, reason: 'That file appears to be empty.' };
  }
  return { ok: true };
}

let counter = 0;
/** Stable unique id for a client-side note record. */
export function nextNoteId(): string {
  counter += 1;
  return `note_${Date.now().toString(36)}_${counter}`;
}
