// StudySmart — Practice: generate questions Edge Function
//
// Runs on Deno (Supabase Edge Functions). Deploy with:
//   supabase functions deploy generate-questions --no-verify-jwt
//   supabase secrets set GEMINI_API_KEY=...   (or OPENAI_API_KEY=...)
//
// SECURITY: the AI key lives ONLY here as a server secret, never in the browser.
// We verify the caller's Supabase JWT so only a signed-in student can invoke it.
// HONESTY: without a key we return AI_NOT_CONFIGURED rather than inventing questions.

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

const DIFFICULTY_GUIDE: Record<string, string> = {
  easy: "EASY recall (definitions, direct facts stated in the notes)",
  medium: "MEDIUM understanding (apply or explain concepts from the notes)",
  hard: "HARD application/analysis (combine ideas, edge cases — still ONLY from the notes)",
};
const MODE_GUIDE: Record<string, string> = {
  mc: "ALL multiple-choice questions (exactly 4 options each, one correct).",
  tf: "ALL true/false statements.",
  sa: "ALL short-answer questions (a concise expected answer).",
  mixed: "a balanced MIX of multiple-choice, true/false and short-answer questions.",
};

function buildPrompt(text: string, mode: string, count: number, difficulty: string, topic?: string, sourceName?: string): string {
  const focus = topic && topic.trim() ? `Focus the questions on the topic "${topic.trim()}" wherever the notes cover it.\n` : "";
  const source = sourceName ? `Source document(s): ${sourceName}\n\n` : "";
  return [
    "You are a study-assessment generator. Create practice questions STRICTLY from the student's notes below.",
    "Rules:",
    "- Base EVERY question, option, correct answer and explanation ONLY on information present in the notes. Never invent facts.",
    `- Produce exactly ${count} questions.`,
    `- Difficulty: ${DIFFICULTY_GUIDE[difficulty] ?? DIFFICULTY_GUIDE.medium}.`,
    `- Question style: ${MODE_GUIDE[mode] ?? MODE_GUIDE.mixed}`,
    "- Multiple choice: exactly 4 options and a correctIndex (0-3).",
    "- True/false: a single clear statement and correct (true/false).",
    "- Short answer: a concise expected answer.",
    "- Every question needs a short explanation and a topic label.",
    focus,
    "",
    source,
    "Return ONLY valid JSON (no prose, no markdown fences):",
    '{ "questions": [ { "type": "mc|tf|sa", "question": "string", "options": ["string"], "correctIndex": 0, "correct": true, "answer": "string", "explanation": "string", "topic": "string" } ] }',
    "Include only the fields relevant to each question type.",
    "",
    "NOTES:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeQuestions(parsed: unknown, count: number) {
  const root = parsed as { questions?: unknown[] };
  const list = Array.isArray(parsed) ? parsed : Array.isArray(root?.questions) ? root.questions : [];
  const out: Record<string, unknown>[] = [];
  for (const item of list) {
    const q = item as Record<string, unknown>;
    const type = String(q?.type ?? "").toLowerCase();
    const question = typeof q?.question === "string" ? q.question.trim() : "";
    const explanation = typeof q?.explanation === "string" ? q.explanation.trim() : "";
    const topic = typeof q?.topic === "string" && q.topic.trim() ? q.topic.trim() : undefined;
    if (!question) continue;
    if (type === "mc") {
      const options = (Array.isArray(q?.options) ? q.options : []).map((o) => String(o).trim()).filter(Boolean);
      const ci = Number(q?.correctIndex);
      if (options.length < 2 || !Number.isInteger(ci) || ci < 0 || ci >= options.length) continue;
      out.push({ type, question, options, correctIndex: ci, explanation, topic });
    } else if (type === "tf") {
      if (typeof q?.correct !== "boolean") continue;
      out.push({ type, question, correct: q.correct, explanation, topic });
    } else if (type === "sa") {
      const answer = typeof q?.answer === "string" ? q.answer.trim() : "";
      if (!answer) continue;
      out.push({ type, question, answer, explanation, topic });
    }
  }
  return out.slice(0, count);
}

async function callGemini(prompt: string, key: string): Promise<{ text?: string; error?: { code: string; message: string } }> {
  const models = ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.7-flash"];
  let last = "unknown";
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json" } }),
      });
    } catch {
      last = "timeout";
      continue; // stalled/overloaded model -> try the next one
    }
    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
      if (text) return { text };
      last = "empty";
      continue;
    }
    last = String(res.status);
    if (res.status === 429) return { error: { code: "RATE_LIMITED", message: "The AI service is busy. Try again shortly." } };
  }
  return { error: { code: "unknown", message: `Gemini request failed (${last}).` } };
}

async function callOpenAI(prompt: string, key: string): Promise<{ text?: string; error?: { code: string; message: string } }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output only valid JSON matching the requested schema." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (res.status === 429) return { error: { code: "RATE_LIMITED", message: "The AI service is busy. Try again shortly." } };
  if (!res.ok) return { error: { code: "unknown", message: "The AI service returned an error." } };
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) return { error: { code: "unknown", message: "The AI service returned no content." } };
  return { text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, code: "unknown", message: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ ok: false, code: "not_configured", message: "Supabase is not configured on the server." }, 500);
    }
    const sb = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, code: "UNAUTHORIZED", message: "You must be signed in to practice." }, 401);
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!geminiKey && !openaiKey) {
      return json({ ok: false, code: "AI_NOT_CONFIGURED", message: "Practice is not connected to an AI model yet (no API key secret)." }, 503);
    }

    const { text, mode, count, difficulty, topic, sourceName } = await req.json();
    if (typeof text !== "string" || text.trim().length === 0) {
      return json({ ok: false, code: "EMPTY_TEXT", message: "There was no readable text to build questions from." }, 400);
    }
    if (text.length > 60_000) {
      return json({ ok: false, code: "TOO_LARGE", message: "Those notes are too large for one request." }, 413);
    }
    const safeCount = Math.min(Math.max(Number(count) || 10, 1), 25);
    const prompt = buildPrompt(text, String(mode ?? "mixed"), safeCount, String(difficulty ?? "medium"), topic, sourceName);

    const result = geminiKey ? await callGemini(prompt, geminiKey) : await callOpenAI(prompt, openaiKey!);
    if (result.error) {
      const status = result.error.code === "RATE_LIMITED" ? 429 : 502;
      return json({ ok: false, ...result.error }, status);
    }

    const questions = normalizeQuestions(extractJson(result.text!), safeCount);
    if (questions.length === 0) {
      return json({ ok: false, code: "unknown", message: "The AI did not return any usable questions." }, 502);
    }
    return json({ ok: true, questions, model: geminiKey ? "gemini" : "openai" });
  } catch (err) {
    console.error("generate-questions error:", err);
    return json({ ok: false, code: "unknown", message: "Unexpected error while creating questions." }, 500);
  }
});
