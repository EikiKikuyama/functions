// functions/tools/tts_batch.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ✅ 入力：official/Level1（必要ならLevel3/5/6にも変えられる）
const ROOT_DIR = '/Users/kikuyama/ShadowSpeak/material_assets/official/Level1';

// ✅ まずは listening.txt だけ（デモ最短）
const TARGET_BASENAME = 'listening.txt';

// 音声設定（必要なら変える）
const voiceName = 'en-US-JennyNeural';
const rate = '0.9';

// 再帰でファイル一覧を作る
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

async function runOne(inputPath) {
  const dir = path.dirname(inputPath);
  const outputPath = path.join(dir, path.basename(inputPath).replace(/\.txt$/i, '.mp3'));

  // すでに存在するならスキップ（再実行が楽）
  if (fs.existsSync(outputPath)) {
    console.log('⏭ skip:', outputPath);
    return;
  }

  console.log('▶ TTS:', inputPath);

  await new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      [path.join(__dirname, 'tts_once.js'), inputPath, outputPath, voiceName, rate],
      { stdio: 'inherit' }
    );
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

async function run() {
  const all = walk(ROOT_DIR);
  const targets = all.filter((p) => path.basename(p) === TARGET_BASENAME);

  console.log(`📦 found ${TARGET_BASENAME}:`, targets.length);

  for (const p of targets) {
    await runOne(p);
  }

  console.log('🎉 TTS 生成完了');
}

run().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
