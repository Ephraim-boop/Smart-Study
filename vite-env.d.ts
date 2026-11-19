/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // Optional: URL of a secure summarize backend (e.g. the local dev server
  // at http://localhost:8787/summarize). When unset, the app calls the
  // Supabase Edge Function instead.
  readonly VITE_SUMMARIZE_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// The prebuilt browser bundle of mammoth (Word .docx -> text) ships without type
// declarations. Only the part the app actually calls is described here, so DOCX
// extraction stays type-checked instead of falling back to `any`.
declare module 'mammoth/mammoth.browser.js' {
  export interface MammothRawTextResult {
    value?: string;
    messages?: { type?: string; message?: string }[];
  }
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothRawTextResult>;
  const mammoth: { extractRawText: typeof extractRawText };
  export default mammoth;
}
