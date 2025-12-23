// tools/upload_official_dir.js
"use strict";

const path = require("path");
const fs = require("fs");
const { Storage } = require("@google-cloud/storage");

// 使い方:
// node tools/upload_official_dir.js <LOCAL_DIR> <REMOTE_PREFIX>

const localRoot = process.argv[2];
const remotePrefix = process.argv[3];

if (!localRoot || !remotePrefix) {
  console.log("Usage: node upload_official_dir.js <LOCAL_DIR> <REMOTE_PREFIX>");
  process.exit(1);
}

// Firebaseのデフォルトバケット
const BUCKET = "shadow-speak-school.firebasestorage.app";

const storage = new Storage();
const bucket = storage.bucket(BUCKET);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".json") return "application/json";
  if (ext === ".txt") return "text/plain";

  // ✅ 画像
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";

  return undefined;
}

const ALLOWED_EXTS = new Set([
  ".mp3",
  ".wav",
  ".json",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

async function existsSameSize(remotePath, localSize) {
  try {
    const [meta] = await bucket.file(remotePath).getMetadata();
    const remoteSize = Number(meta.size || 0);
    return remoteSize === localSize;
  } catch (e) {
    return false;
  }
}

async function main() {
  const files = walk(localRoot).filter((f) => {
    const base = path.basename(f);
    if (base === ".DS_Store") return false; // ✅ macゴミ除外
    const ext = path.extname(f).toLowerCase();
    return ALLOWED_EXTS.has(ext);
  });

  console.log("📦 local files:", files.length);

  for (const f of files) {
    const r = rel(localRoot, f);
    const remotePath = `${remotePrefix}/${r}`;

    const st = fs.statSync(f);
    const skip = await existsSameSize(remotePath, st.size);
    if (skip) {
      console.log("⏭ skip:", remotePath);
      continue;
    }

    console.log("⬆️ upload:", f, "->", remotePath);

    await bucket.upload(f, {
      destination: remotePath,
      metadata: {
        contentType: contentTypeFor(f),
        cacheControl: "public, max-age=3600",
      },
    });
  }

  console.log("✅ done");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
