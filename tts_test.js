"use strict";

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // v2
const crypto = require("crypto");

// =====================
// Env
// =====================
const SPEECH_KEY = process.env.SPEECH_KEY;
const SPEECH_REGION = process.env.SPEECH_REGION; // 例: japaneast, eastus, etc.

if (!SPEECH_KEY || !SPEECH_REGION) {
  console.error("❌ Missing env. Set SPEECH_KEY and SPEECH_REGION.");
  process.exit(1);
}

// =====================
// Helpers
// =====================
function escapeXml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Azure prosody rate: "0.85" のような倍率で渡す（安全）
// 例: -15% -> 0.85
function rateFromPercentMinus(pctMinus) {
  const r = 1 - (pctMinus / 100);
  // 0.6～1.3ぐらいを安全域としてクランプ（破綻防止）
  const clamped = Math.max(0.6, Math.min(1.3, r));
  return clamped.toFixed(2);
}

async function getAzureToken() {
  const tokenRes = await fetch(
    `https://${SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`,
    {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": SPEECH_KEY },
    }
  );
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Azure token failed: ${tokenRes.status} ${t}`);
  }
  return tokenRes.text();
}

async function azureTtsWav({ text, voiceName, rateMultiplier }) {
  const token = await getAzureToken();

  const ssml = `
<speak version="1.0" xml:lang="en-US">
  <voice xml:lang="en-US" name="${voiceName}">
    <prosody rate="${rateMultiplier}">
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`.trim();

  const ttsRes = await fetch(
    `https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",
        "User-Agent": "shadow-speak-tts-test",
      },
      body: ssml,
    }
  );

  if (!ttsRes.ok) {
    const t = await ttsRes.text();
    throw new Error(`Azure TTS failed: ${ttsRes.status} ${t}`);
  }

  const arrayBuf = await ttsRes.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// =====================
// Config（ここが肝）
// =====================

// ✅ Levelごとのデフォルト声
// 好みで差し替えてOK（例：男性系なら Guy / Brandon など）
const LEVEL_VOICE = {
  Level1: "en-US-JennyNeural",
  Level2: "en-US-GuyNeural",
  Level3: "en-US-JennyNeural",
  Level4: "en-US-BrandonNeural",
  Level5: "en-US-JennyNeural",
  Level6: "en-US-GuyNeural",
};

// ✅ Levelごとのデフォルト速度（あなたの最新方針に合わせてる）
// ※ pctMinus: “-15%” の「15」を入れる
const LEVEL_SPEED = {
  Level1: 30, // -30%
  Level2: 25, // -25%（まずこれを仮。耳で -24/-27 へ調整）
  Level3: 25, // -25%（同上）
  Level4: 15, // -15%
  Level5: 15, // -15%
  Level6: 3,  // -3%
};

// ✅ patternごとに上書きしたい場合（任意）
// 例：Dは少し遅く、evaluationは別声…など自由に設定できる
const PATTERN_OVERRIDE = {
  // "D": { pctMinus: 18, voiceName: "en-US-JennyNeural" },
  // "evaluation": { pctMinus: 12, voiceName: "en-US-AriaNeural" },
};

// テストで作る rate セット（あなたが欲しいやつ）
const TEST_PCTS = [0, 3, 9, 15, 18, 21, 24, 27, 30]; // “-x%” の x

function resolveVoice(level, pattern) {
  if (PATTERN_OVERRIDE[pattern]?.voiceName) return PATTERN_OVERRIDE[pattern].voiceName;
  return LEVEL_VOICE[level] || "en-US-JennyNeural";
}

function resolvePctMinus(level, pattern) {
  if (PATTERN_OVERRIDE[pattern]?.pctMinus != null) return PATTERN_OVERRIDE[pattern].pctMinus;
  return LEVEL_SPEED[level] ?? 15;
}

// =====================
// Main
// =====================
(async () => {
  const outDir = path.join(process.cwd(), "tts_out");
  fs.mkdirSync(outDir, { recursive: true });

  // テスト文（あなたが貼ってくれたやつ）
  const text =
    "This is a speed test for Shadow Speak. Please listen carefully. " +
    "The quick brown fox jumps over the lazy dog. " +
    "In the morning, students practice listening and shadowing to improve pronunciation.";

  // ここで “Levelごと” に作る（デモ用）
  const levels = ["Level1", "Level2", "Level3", "Level4", "Level5", "Level6"];

  // patternも指定できる（例："A" / "B" / "D" / "evaluation"）
  const pattern = "D"; // ←必要なら変えてOK（または "evaluation" など）

  console.log("✅ Generating test WAVs...");
  console.log("Region:", SPEECH_REGION);

  for (const level of levels) {
    const voiceName = resolveVoice(level, pattern);

    // 「Levelのデフォルト速度」でも良いし、今回は “テスト用に全部” 出すでもOK。
    // ここはあなたの要望通り「0, -3, ... -30」を全部作る。
    for (const pct of TEST_PCTS) {
      const rateMultiplier = rateFromPercentMinus(pct);

      const tag = `${level}_${pattern}_minus${pct}pct_${voiceName.replace(/[^a-zA-Z0-9_-]/g, "")}`;
      const file = path.join(outDir, `${tag}.wav`);

      // 同名があったらスキップ（再生成したいなら消す）
      if (fs.existsSync(file)) continue;

      try {
        const wav = await azureTtsWav({ text, voiceName, rateMultiplier });
        fs.writeFileSync(file, wav);
        console.log("  ✅", path.basename(file));
      } catch (e) {
        console.error("  ❌", level, pct, voiceName, e.message || e);
      }
    }
  }

  console.log("🎧 Done. Check:", outDir);
})();
