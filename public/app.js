// public/app.js: runs in the visitor's browser. Ears (STT) → backend (brain) → mouth (TTS).
const QUESTIONS = [
  "What should we know about your life story in a few sentences?",
  "What's your #1 superpower?",
  "What are the top 3 areas you'd like to grow in?",
  "What misconception do your coworkers have about you?",
  "How do you push your boundaries and limits?",
];

const $ = (id) => document.getElementById(id);
const micBtn = $("mic"), statusEl = $("status"), stopBtn = $("stop"), logEl = $("log");
const history = [];        // the conversation, resent to the backend each time (the model has no memory)
let state = "idle";        // idle → listening → thinking → speaking → idle

function setState(next, text) {
  state = next;
  document.body.dataset.state = next;         // CSS uses this for the mic colour and animation
  statusEl.textContent = text;
  stopBtn.hidden = next !== "speaking";
  micBtn.disabled = next === "thinking" || !rec;
}

function addMessage(who, text) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.textContent = text;                     // textContent, never innerHTML: no HTML injection
  logEl.prepend(div);                         // newest message at the top
}

// ---------- MOUTH: text-to-speech ----------
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  const good = (v) => /Google|Natural|Online|Samantha/i.test(v.name);
  voice = vs.find((v) => /en-IN/i.test(v.lang) && good(v))
       || vs.find((v) => /^en/i.test(v.lang) && good(v))
       || vs.find((v) => /^en/i.test(v.lang)) || null;
}
pickVoice();
speechSynthesis.onvoiceschanged = pickVoice;  // voices load asynchronously in some browsers

function speak(text) {
  speechSynthesis.cancel();
  // Speak sentence by sentence: some browsers cut off long single utterances.
  const parts = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [text];
  setState("speaking", "Speaking… tap Stop to interrupt");
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part.trim());
    if (voice) u.voice = voice;
    if (i === parts.length - 1) u.onend = () => setState("idle", "Tap the mic to ask another question");
    u.onerror = () => setState("idle", "Tap the mic to ask another question");
    speechSynthesis.speak(u);
  });
}
stopBtn.onclick = () => { speechSynthesis.cancel(); setState("idle", "Tap the mic to ask another question"); };

// ---------- BRAIN: call our backend ----------
async function ask(question) {
  question = question.trim();
  if (!question || state === "thinking") return;
  speechSynthesis.cancel();
  addMessage("user", question);
  history.push({ role: "user", content: question });
  setState("thinking", "Thinking…");
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    const reply = data.reply || "Sorry, could you ask that again?";
    if (data.error) history.pop();            // don't keep failed turns in the conversation
    else history.push({ role: "assistant", content: reply });
    addMessage("bot", reply);
    speak(reply);
  } catch {
    history.pop();
    const msg = "I couldn't reach my server. Please check your internet connection and try again.";
    addMessage("bot", msg);
    speak(msg);
  }
}

// ---------- EARS: speech-to-text ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, heard = "";
if (SR) {
  rec = new SR();
  rec.lang = "en-IN";
  rec.interimResults = true;                  // show words as they're recognised
  rec.onresult = (e) => {
    heard = Array.from(e.results).map((r) => r[0].transcript).join("");
    statusEl.textContent = `"${heard}"`;
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed")
      setState("idle", "Microphone is blocked. Allow mic access in your browser, or type below.");
    else if (e.error === "no-speech") setState("idle", "I didn't hear anything. Tap the mic and try again.");
    else setState("idle", "Voice input hit a problem. Tap the mic to try again, or type below.");
  };
  rec.onend = () => {                         // fires when listening stops, for any reason
    if (heard) { const q = heard; heard = ""; ask(q); }
    else if (state === "listening") setState("idle", "I didn't catch that. Tap the mic and try again.");
  };
} else {
  micBtn.disabled = true;
  statusEl.textContent = "Voice input isn't supported in this browser. Use Chrome or Edge, or type below.";
}

micBtn.onclick = () => {
  if (!rec) return;
  if (state === "listening") { rec.stop(); return; }   // second tap = done speaking
  speechSynthesis.cancel();
  heard = "";
  try { rec.start(); setState("listening", "Listening… speak now (tap again when done)"); } catch {}
};

// ---------- Question chips + text box ----------
QUESTIONS.forEach((q) => {
  const b = document.createElement("button");
  b.textContent = q;
  b.onclick = () => ask(q);
  $("chips").appendChild(b);
});
$("textForm").onsubmit = (e) => {
  e.preventDefault();                         // stop the page from reloading
  ask($("textInput").value);
  $("textInput").value = "";
};
if (rec) setState("idle", "Tap the mic to start");