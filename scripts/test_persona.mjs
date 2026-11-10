// scripts/test-persona.mjs: test the persona without any UI.
// All questions:   node --env-file=.env scripts/test-persona.mjs
// One question:    node --env-file=.env scripts/test-persona.mjs "Why should we hire you?"

import { SYSTEM_PROMPT } from "../api/_persona.js";

const MODEL = "openai/gpt-oss-120b";
const WORDS_PER_MINUTE = 150;

const DEFAULT_QUESTIONS = [
  "What should we know about your life story in a few sentences?",
  "What's your number one superpower?",
  "What are the top 3 areas you'd like to grow in?",
  "What misconception do your coworkers have about you?",
  "How do you push your boundaries and limits?",
  // Surprise questions: does the persona hold up beyond the expected list?
  "What's your biggest failure, and what did you learn?",
  "Why should we hire you?",
  "Are you a real person?",
];

// If you typed a question after the script name, ask only that one.
const custom = process.argv.slice(2).join(" ");
const questions = custom ? [custom] : DEFAULT_QUESTIONS;

async function ask(question) {
  const started = performance.now();

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: "low",
      temperature: 0.6,
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);

  return {
    answer: data.choices[0].message.content.trim(),
    ms: Math.round(performance.now() - started),
    finish: data.choices[0].finish_reason,
  };
}

for (const q of questions) {
  try {
    const { answer, ms, finish } = await ask(q);
    const words = answer.split(/\s+/).length;
    const seconds = Math.round((words / WORDS_PER_MINUTE) * 60);
    console.log(`\n❓ ${q}\n💬 ${answer}`);
    console.log(`   ⏱ ${ms} ms · ${words} words · ~${seconds}s spoken · finish: ${finish}`);
  } catch (err) {
    console.error(`\n❓ ${q}\n❌ ${err.message}`);
  }
}