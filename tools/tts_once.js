// tts_once.js
require('dotenv').config();
const fs = require('fs');
const https = require('https');
const path = require('path');

const key = process.env.SPEECH_KEY;
const region = process.env.SPEECH_REGION;

if (!key || !region) {
  console.error('SPEECH_KEY と SPEECH_REGION を .env に設定してください');
  process.exit(1);
}

// 使い方:
// node tts_once.js input.txt output.mp3 en-US-JennyNeural 0.9
// node tts_once.js input.txt output.mp3 en-US-JennyNeural -10%
// node tts_once.js input.txt output.mp3 en-US-JennyNeural slow

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'output.mp3';
const voiceName = process.argv[4] || 'en-US-JennyNeural';
const rateArg = process.argv[5] || '0.9';

if (!inputPath) {
  console.error('使い方: node tts_once.js input.txt output.mp3 [voiceName] [rate]');
  process.exit(1);
}

// ---- XML escape（教材テキストに & や < が入っても壊れない）----
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---- Azure prosody rate 正規化 ----
// - 0.9 みたいな倍率 → -10% に変換
// - 1.1 → +10%
// - すでに -10% などの%指定 → そのまま
// - slow/medium/fast 等 → そのまま
function normalizeRate(arg) {
  const s = String(arg).trim();

  // already percent (e.g., -10%, +5%)
  if (/^[+-]?\d+%$/.test(s)) return s;

  // named rates (Azure SSML compatible set)
  const named = new Set(['x-slow', 'slow', 'medium', 'fast', 'x-fast', 'default']);
  if (named.has(s)) return s;

  // numeric multiplier (e.g., 0.9, 1.05)
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) {
    const pct = Math.round((n - 1) * 100); // 0.9 -> -10
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  }

  // fallback
  return 'default';
}

const rate = normalizeRate(rateArg);

// テキスト読み込み（SSML安全化）
const rawText = fs.readFileSync(inputPath, 'utf8').trim();
const text = escapeXml(rawText);

// 🔹 声と速度を引数から変更できるようにした SSML
const ssml = `
<speak version='1.0' xml:lang='en-US'>
  <voice xml:lang='en-US' name='${voiceName}'>
    <prosody rate='${rate}'>
      ${text}
    </prosody>
  </voice>
</speak>
`;

function synthesize(ssmlText, outPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${region}.tts.speech.microsoft.com`,
      path: '/cognitiveservices/v1',
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'shadow-speak-tts-script'
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', (chunk) => (body += chunk.toString()));
        res.on('end', () => {
          reject(new Error(`TTS 失敗 status=${res.statusCode} body=${body}`));
        });
        return;
      }

      const dir = path.dirname(outPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileStream = fs.createWriteStream(outPath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        console.log(`✅ 作成完了: ${outPath} (voice=${voiceName}, rate=${rate} from "${rateArg}")`);
        resolve();
      });
      fileStream.on('error', reject);
    });

    req.on('error', reject);
    req.write(ssmlText);
    req.end();
  });
}

synthesize(ssml, outputPath).catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
