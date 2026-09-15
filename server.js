// blooket-lookup — fetches live Blooket game answers via unofficial API
// node server.js → open http://localhost:3000
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const BLOOKET_API = "https://api.blooket.com/api";
const BLOOKET_WWW = "https://www.blooket.com/api";

// ── join a game by lobby id, returns game metadata incl. set id ──
async function joinGame(gameId, name) {
  const res = await fetch(`${BLOOKET_WWW}/firebase/join`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: gameId, name }),
  });
  if (!res.ok) throw new Error(`Join failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── fetch the full question set ──
async function fetchSet(setId) {
  const res = await fetch(`${BLOOKET_API}/games?gameId=${setId}`);
  if (!res.ok) throw new Error(`Set fetch failed: ${res.status}`);
  return res.json();
}

// ── build answer lookup map ──
function buildAnswerMap(setData) {
  const map = {};
  for (const q of setData.questions || []) {
    const correct = (q.answers || []).find((a) => a.correct);
    map[q.question] = {
      answers: (q.answers || []).map((a) => ({
        text: a.text,
        correct: !!a.correct,
      })),
      correctAnswer: correct ? correct.text : null,
      timeLimit: q.timeLimit || null,
      imageUrl: q.imageUrl || null,
    };
  }
  return map;
}

app.post("/api/lookup", async (req, res) => {
  const { gameId, name } = req.body;
  if (!gameId) return res.status(400).json({ error: "gameId required" });

  try {
    // 1. join → get set id
    const joinRes = await joinGame(gameId, name || "lookup" + Math.floor(Math.random() * 9999));
    const setId = joinRes.set;
    if (!setId) throw new Error("No set ID in join response — game may not be live");

    // 2. fetch questions
    const setData = await fetchSet(setId);

    // 3. build map
    const answerMap = buildAnswerMap(setData);

    // 4. save JSON
    const out = {
      gameId,
      setId,
      setName: setData.name || null,
      fetchedAt: new Date().toISOString(),
      questionCount: (setData.questions || []).length,
      answers: answerMap,
    };
    if (!fs.existsSync(path.join(__dirname, "saves"))) fs.mkdirSync(path.join(__dirname, "saves"));
    const fname = `lookup_${gameId}_${Date.now()}.json`;
    fs.writeFileSync(path.join(__dirname, "saves", fname), JSON.stringify(out, null, 2));

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── answer a specific question text ──
app.post("/api/answer", async (req, res) => {
  const { gameId, question } = req.body;
  try {
    const joinRes = await joinGame(gameId, "q" + Math.floor(Math.random() * 9999));
    const setData = await fetchSet(joinRes.set);
    const q = (setData.questions || []).find(
      (x) => x.question.toLowerCase().trim() === question.toLowerCase().trim()
    );
    if (!q) return res.json({ found: false });
    const correct = (q.answers || []).find((a) => a.correct);
    res.json({ found: true, correctAnswer: correct ? correct.text : null, all: q.answers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log("blooket lookup → http://localhost:3000"));
