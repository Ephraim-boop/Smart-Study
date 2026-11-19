// StudySmart — Flashcards: generate flashcards Edge Function
//
// Runs on Deno (Supabase Edge Functions). Deploy with:
//   supabase functions deploy generate-flashcards --no-verify-jwt
//   supabase secrets set GEMINI_API_KEY=...   (or OPENAI_API_KEY=...)
//
// SECURITY: the AI key lives ONLY here as a server secret, never in the browser.
// We verify the caller's Supabase JWT so only a signed-in student can invoke it.
// HONESTY: without a key we return AI_NOT_CONFIGURED rather than inventing cards.

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
  easy: "EASY cards (simple term/definition recall)",
  medium: "MEDIUM cards (concepts and short explanations)",
  hard: "HARD cards (deeper why/how, relationships between ideas)",
};

function buildPrompt(
  text: string,
  count: number,
  difficulty: string,
  topic?: string,
  sourceName?: string,
): string {
  const focus = topic && topic.trim() ? `Focus the cards on the topic "${topic.trim()}" wherever the notes cover it.\n` : "";
  const source = sourceName ? `Source document(s): ${sourceName}\n\n` : "";
  return [
    "You are a flashcard generator. Create study flashcards STRICTLY from the student's notes below.",
    "Rules:",
    "- Base EVERY card front and back ONLY on information present in the notes. Never invent facts.",
    `- Produce exactly ${count} flashcards.`,
    `- Difficulty: ${DIFFICULTY_GUIDE[difficulty] ?? "a MIX of easy, medium and hard cards"}.`,
    "- front: a term, question or prompt (concise). back: the answer, definition or explanation.",
    "- topic: a short subject label. difficulty: exactly one of easy, medium, hard.",
    "- Each card must be self-contained and make sense on its own.",
    focus,
    "",
    source,
    "Return ONLY valid JSON (no prose, no markdown fences):",
    '{ "cards": [ { "front": "string", "back": "string", "topic": "string", "difficulty": "easy|medium|hard" } ] }',
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

function normalizeFlashcards(parsed: unknown, count: number) {
  const root = parsed as { cards?: unknown[] };
  const list = Array.isArray(parsed) ? parsed : Array.isArray(root?.cards) ? root.cards : [];
  const out: Record<string, unknown>[] = [];
  for (const item of list) {
    const c = item as Record<string, unknown>;
    const front = typeof c?.front === "string" ? c.front.trim() : "";
    const back = typeof c?.back === "string" ? c.back.trim() : "";
    if (!front || !back) continue;
    const topic = typeof c?.topic === "string" && c.topic.trim() ? c.topic.trim() : undefined;
    const difficulty = ["easy", "medium", "hard"].includes(String(c?.difficulty).toLowerCase())
      ? String(c.difficulty).toLowerCase()
      : "medium";
    out.push({ front, back, topic, difficulty });
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
      return json({ ok: false, code: "UNAUTHORIZED", message: "You must be signed in to make flashcards." }, 401);
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!geminiKey && !openaiKey) {
      return json({ ok: false, code: "AI_NOT_CONFIGURED", message: "Flashcards are not connected to an AI model yet (no API key secret)." }, 503);
    }

    const { text, count, difficulty, topic, sourceName } = await req.json();
    if (typeof text !== "string" || text.trim().length === 0) {
      return json({ ok: false, code: "EMPTY_TEXT", message: "There was no readable text to build flashcards from." }, 400);
    }
    if (text.length > 60_000) {
      return json({ ok: false, code: "TOO_LARGE", message: "Those notes are too large for one request." }, 413);
    }
    const safeCount = Math.min(Math.max(Number(count) || 10, 1), 40);
    const prompt = buildPrompt(text, safeCount, String(difficulty ?? ""), topic, sourceName);

    const result = geminiKey ? await callGemini(prompt, geminiKey) : await callOpenAI(prompt, openaiKey!);
    if (result.error) {
      const status = result.error.code === "RATE_LIMITED" ? 429 : 502;
      return json({ ok: false, ...result.error }, status);
    }

    const cards = normalizeFlashcards(extractJson(result.text!), safeCount);
    if (cards.length === 0) {
      return json({ ok: false, code: "unknown", message: "The AI did not return any usable flashcards." }, 502);
    }
    return json({ ok: true, cards, model: geminiKey ? "gemini" : "openai" });
  } catch (err) {
    console.error("generate-flashcards error:", err);
    return json({ ok: false, code: "unknown", message: "Unexpected error while creating flashcards." }, 500);
  }
});
