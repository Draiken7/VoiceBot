// api/chat.js: Vercel turns this file into the endpoint POST /api/chat.
// The browser sends the conversation; we add the persona, call Groq, check for leaks, reply.
import { SYSTEM_PROMPT, CANARY } from "./_persona.js";
import { PROFILE } from "./_profile.js";

const MODEL = "openai/gpt-oss-120b";
const MAX_HISTORY = 10;   // only the last 10 messages (keeps cost from growing with each turn)
const MAX_CHARS = 1000;   // cap each message's length (stops huge inputs)
const SAFE_REPLY = "I'd rather just talk about my work and experience. Ask me something specific!";

// ---- Leak check: does the reply copy the profile word for word? ----
const N = 8; // shingle size: runs of 8 consecutive words
function shingles(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + N <= words.length; i++) set.add(words.slice(i, i + N).join(" "));
  return set;
}
const PROFILE_SHINGLES = shingles(Object.values(PROFILE).join(" ")); // built once, at startup
const PROMPT_MARKERS = ["RULES FOR EVERY ANSWER", "MY STORY BANK", "CONFIDENTIALITY", "QUESTIONS THIS BOT"];

function isLeak(reply) {
  if (reply.includes(CANARY)) return true;                                  // canary test
  const upper = reply.toUpperCase();
  if (PROMPT_MARKERS.some((m) => upper.includes(m))) return true;           // heading test
  const r = shingles(reply);
  if (r.size === 0) return false;
  let copied = 0;
  for (const s of r) if (PROFILE_SHINGLES.has(s)) copied++;
  return copied / r.size > 0.5;                                             // containment > 50%
}

// ---- The endpoint ----
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
  // Keep only user/assistant turns. A visitor must never be able to inject a "system" message.
  const messages = incoming
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (messages.length === 0) return res.status(400).json({ error: "No question received" });

  try {
    const groq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`, // the key lives only on the server
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning_effort: "low",
        temperature: 0.6,
        max_completion_tokens: 400,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });
    const data = await groq.json();

    if (!groq.ok) {
      console.error("Groq error", groq.status, JSON.stringify(data)); // visible in Vercel logs
      const reply = groq.status === 429
        ? "I'm getting a lot of questions right now. Give me a few seconds and ask again."
        : "Sorry, something went wrong on my side. Please try again.";
      return res.status(200).json({ reply, error: true });
    }

    let reply = data.choices?.[0]?.message?.content?.trim()
      || "Sorry, I lost my train of thought. Could you ask that again?";
    if (isLeak(reply)) reply = SAFE_REPLY;
    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ reply: "Sorry, I couldn't think of an answer just now. Please try again.", error: true });
  }
}