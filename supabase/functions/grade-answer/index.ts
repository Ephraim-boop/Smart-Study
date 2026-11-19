// StudySmart — Practice: grade a short answer Edge Function
//
// Deploy with:
//   supabase functions deploy grade-answer --no-verify-jwt
//   supabase secrets set GEMINI_API_KEY=...   (or OPENAI_API_KEY=...)
//
// SECURITY: AI key stays server-side; caller must be signed in.
// HONESTY: grading is done by the model against the expected answer — never faked.

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

function buildPrompt(question: string, referenceAnswer: string, studentAnswer: string): string {
  return [
    "You grade a student's short answer to a study question. Judge it ONLY against the expected answer.",
    "Consider it correct if it conveys the same key idea(s); minor wording, spelling or length differences are fine.",
    "Do not require information that is not in the expected answer.",
    "",
    `Question: ${question}`,
    `Expected answer: ${referenceAnswer}`,
    `Student's answer: ${studentAnswer}`,
    "",
    'Return ONLY valid JSON (no prose, no fences): { "correct": true|false, "feedback": "1-2 specific, encouraging sentences." }',
  ].join("\n");
}

function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
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
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
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
      temperature: 0.1,
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

    const { question, referenceAnswer, studentAnswer } = await req.json();
    if (typeof question !== "string" || typeof referenceAnswer !== "string" || typeof studentAnswer !== "string") {
      return json({ ok: false, code: "unknown", message: "Missing question, expected answer, or your answer." }, 400);
    }

    const prompt = buildPrompt(question, referenceAnswer, studentAnswer);
    const result = geminiKey ? await callGemini(prompt, geminiKey) : await callOpenAI(prompt, openaiKey!);
    if (result.error) {
      const status = result.error.code === "RATE_LIMITED" ? 429 : 502;
      return json({ ok: false, ...result.error }, status);
    }

    const parsed = extractJson(result.text!) as { correct?: unknown; feedback?: unknown };
    return json({
      ok: true,
      correct: parsed?.correct === true,
      feedback: typeof parsed?.feedback === "string" ? parsed.feedback.trim() : "",
    });
  } catch (err) {
    console.error("grade-answer error:", err);
    return json({ ok: false, code: "unknown", message: "Unexpected error while grading." }, 500);
  }
});
