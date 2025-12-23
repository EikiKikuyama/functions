// import_illustration_materials.js

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Firebase コンソールからダウンロードしたサービスアカウントキー
// ファイル名は自分の実際の名前に合わせて変えてOK
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// 引数で schoolId を指定できるようにする（デフォルトは 2025-demo）
const schoolId = process.argv[2] || "2025-demo";

async function main() {
  const jsonPath = path.join(__dirname, "illustration_materials.json");
  const raw = fs.readFileSync(jsonPath, "utf8");
  const materials = JSON.parse(raw);

  console.log(`🎯 schoolId = ${schoolId}`);
  console.log(`📦 importing ${materials.length} materials...`);

  const BATCH_SIZE = 400;
  let batch = db.batch();
  let count = 0;

  for (const mat of materials) {
    const docId = mat.docId; // Firestore の doc ID
    if (!docId) {
      console.warn("⚠️ docId がないエントリをスキップ:", mat);
      continue;
    }

    // Firestore に書き込むデータ（docId は中には入れなくてOK）
    const { docId: _removed, ...data } = mat;

    const docRef = db
      .collection("schools")
      .doc(schoolId)
      .collection("materials")
      .doc(docId);

    batch.set(docRef, {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    count++;
    if (count % BATCH_SIZE === 0) {
      console.log(`✅ committing batch: ${count} docs`);
      await batch.commit();
      batch = db.batch();
    }
  }

  if (count % BATCH_SIZE !== 0) {
    console.log(`✅ committing final batch: ${count} docs`);
    await batch.commit();
  }

  console.log(`🎉 done. imported ${count} materials.`);
}

main().catch((err) => {
  console.error("🔥 import error", err);
  process.exit(1);
});
