"use strict";

const fs = require("fs");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

// 使い方:
// export SPEECH_KEY="..."; export SPEECH_REGION="japaneast"
// node tools/tts_dialogue_from_txt.js input.txt output.wav
//
// input.txt 形式: "Speaker: text"
// 例: Mom: Hi, Daniel.
//     Daniel: He went to the store.

function escapeXml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// input path に official/Level{n}/ が含まれていれば n を返す
function inferLevelFromPath(p) {
  const m = String(p).match(/\/Level([1-6])\//i);
  return m ? Number(m[1]) : null;
}

// あなたのWPM設計に基づく rate マップ（Azure SSML）
function rateForLevel(level) {
  // 既定（Level不明の場合は標準）
  if (!level) return "0%";

  const map = {
    1: "-30%",
    2: "-27%",
    3: "-21%",
    4: "-15%",
    5: "-12%",
    6: "-3%",
  };
  return map[level] ?? "0%";
}

function buildSsmlFromDialogue(lines, voiceMap, opts) {
  const { lang, rate } = opts;

  const parts = [];
  parts.push(
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">`
  );

  const useRate = rate && rate !== "0%";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const m = line.match(/^([^:]{1,40})\s*:\s*(.+)$/);
    let speaker;
    let text;

    if (!m) {
      speaker = "__default";
      text = line;
    } else {
      speaker = m[1].trim();
      text = m[2].trim();
    }

    const voice = voiceMap[speaker] || voiceMap.__default || "en-US-JennyNeural";
    const body = useRate
      ? `<prosody rate="${rate}">${escapeXml(text)}</prosody>`
      : `${escapeXml(text)}`;

    // ✅ break は voice の中、prosody も voice の中
    parts.push(
      `<voice name="${voice}">${body}<break time="150ms"/></voice>`
    );
  }

  parts.push(`</speak>`);
  return parts.join("\n");
}


async function main() {
  const input = process.argv[2];
  const outPath = process.argv[3] || "output.wav";

  if (!input) {
    console.log("Usage: node tools/tts_dialogue_from_txt.js input.txt output.wav");
    process.exit(1);
  }

  const key = process.env.SPEECH_KEY;
  const region = process.env.SPEECH_REGION;
  if (!key || !region) {
    console.error("Missing SPEECH_KEY or SPEECH_REGION env vars.");
    process.exit(1);
  }

  const txt = fs.readFileSync(input, "utf8");
  const lines = txt.split(/\r?\n/);

  // ★話者→ボイス割り当て（必要なら増やす）
  const voiceMap = {
    Mom: "en-US-JennyNeural",
    Daniel: "en-US-ChristopherNeural",
    __default: "en-US-JennyNeural",
  };

  // ✅ Levelから速度決定（input path を見る）
  const level = inferLevelFromPath(input);
  const rate = rateForLevel(level);

  const ssml = buildSsmlFromDialogue(lines, voiceMap, {
    lang: "en-US",
    rate,
  });

  fs.writeFileSync(outPath.replace(/\.(wav|mp3)$/i, ".ssml"), ssml, "utf8");
  console.log(`ℹ️ inferred level=${level ?? "unknown"} → rate=${rate}`);

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisOutputFormat =
    sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;

  const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outPath);
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  await new Promise((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          console.log("✅ TTS done:", outPath);
          resolve();
        } else {
          reject(new Error(result.errorDetails || "TTS failed"));
        }
      },
      (err) => {
        synthesizer.close();
        reject(err);
      }
    );
  });
}

main().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});
