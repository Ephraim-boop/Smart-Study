// StudySmart — Smart Summarize Edge Function
//
// Runs on Deno (Supabase Edge Functions). Deploy with:
//   supabase functions deploy summarize-notes --no-verify-jwt
//   supabase secrets set OPENAI_API_KEY=sk-...
//
// SECURITY:
//   * The OpenAI key lives ONLY here, as a server secret — never in the browser.
//   * We verify the caller's Supabase JWT before doing any work, so only a
//     signed-in student can invoke the model on the app's dime.
//   * We never persist file contents; the browser sends already-extracted text.
//
// HONESTY: if OPENAI_API_KEY is not configured we return a clear
// AI_NOT_CONFIGURED error rather than inventing a summary.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const LENGTH_GUIDE: Record<string, string> = {
  short: "a SHORT summary (very concise, ~5 key points max)",
  medium: "a MEDIUM summary (balanced detail)",
  detailed: "a DETAILED summary (thorough, more points and topics)",
};

const LANGUAGE_NAME: Record<string, string> = { en: "English", fr: "French" };

// The exact JSON shape the model must return (mirrors SummaryResult in src/summarize/types.ts).
function buildPrompt(text: string, length: string, language: string, sourceName?: string): string {
  const lang = LANGUAGE_NAME[language] ?? "English";
  const len = LENGTH_GUIDE[length] ?? LENGTH_GUIDE.medium;
  const source = sourceName ? `Source document(s): ${sourceName}\n\n` : "";
  return [
    "You are a study assistant. Summarize ONLY the student's notes provided below.",
    "Base every statement strictly on the notes. Do NOT invent facts, dates, formulas or",
    "definitions that are not present. If a category has no content in the notes, return an",
    `empty array for it. Write the summary in ${lang}. Produce ${len}.`,
    "",
    "Return ONLY valid JSON with exactly this shape (no prose, no markdown fences):",
    `{
  "mainSummary": "string",
  "keyPoints": ["string"],
  "definitions": [{ "term": "string", "definition": "string" }],
  "facts": ["string"],
  "topics": [{ "title": "string", "explanation": "string" }],
  "revisionTips": ["string"]
}`,
    "",
    source,
    "NOTES:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

function parseSummary(raw: string): unknown {
  // Strip common markdown fences and grab the first {...} block defensively.
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, code: "unknown", message: "Method not allowed" }, 405);

  try {
    // 1) Verify the caller is a signed-in student.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ ok: false, code: "not_configured", message: "Supabase is not configured on the server." }, 500);
    }
    const sb = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, code: "UNAUTHORIZED", message: "You must be signed in to summarize notes." }, 401);
    }

    // 2) Require the AI key — never fake a summary without it.
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return json({
        ok: false,
        code: "AI_NOT_CONFIGURED",
        message: "Smart Summarize is not connected to an AI model yet (OPENAI_API_KEY secret is missing).",
      }, 503);
    }

    // 3) Validate input.
    const { text, length, language, sourceName } = await req.json();
    if (typeof text !== "string" || text.trim().length === 0) {
      return json({ ok: false, code: "EMPTY_TEXT", message: "There was no readable text to summarize." }, 400);
    }
    if (text.length > 60_000) {
      return json({ ok: false, code: "TOO_LARGE", message: "Those notes are too large for one request." }, 413);
    }

    // 4) Call OpenAI.
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You output only valid JSON matching the requested schema." },
          { role: "user", content: buildPrompt(text, String(length ?? "medium"), String(language ?? "en"), sourceName) },
        ],
      }),
    });

    if (openaiRes.status === 429) {
      return json({ ok: false, code: "RATE_LIMITED", message: "The AI service is busy. Try again shortly." }, 429);
    }
    if (!openaiRes.ok) {
      const detail = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, detail);
      return json({ ok: false, code: "unknown", message: "The AI service returned an error." }, 502);
    }

    const payload = await openaiRes.json();
    const content: string | undefined = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return json({ ok: false, code: "unknown", message: "The AI service returned no content." }, 502);
    }

    const summary = parseSummary(content);
    return json({ ok: true, summary, model: payload?.model ?? "openai" });
  } catch (err) {
    console.error("summarize-notes error:", err);
    return json({ ok: false, code: "unknown", message: "Unexpected error while summarizing." }, 500);
  }
});
