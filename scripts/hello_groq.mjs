// scripts/hello-groq.mjs: check the Groq key and model with one request.
// Run from the VoiceBot folder:  node --env-file=.env scripts/hello-groq.mjs

const MODEL = "openai/gpt-oss-120b";

// 1) Is the key loaded? Show only the first characters, never the whole key.
const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("❌ GROQ_API_KEY not found. Did you run with --env-file=.env from the VoiceBot folder?");
  process.exit(1);
}
console.log("🔑 Key loaded:", key.slice(0, 7) + "…");

// 2) Send one chat request.
const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${key}`,
  },
  body: JSON.stringify({
    model: MODEL,
    reasoning_effort: "low",
    messages: [{ role: "user", content: "In one sentence, what is a voice bot?" }],
  }),
});

// 3) Show the result, or the error.
const data = await response.json();
if (!response.ok) {
  console.error("❌ HTTP", response.status, JSON.stringify(data, null, 2));
  process.exit(1);
}
console.log("✅ Reply:", data.choices[0].message.content);
console.log("📊 Usage:", data.usage);