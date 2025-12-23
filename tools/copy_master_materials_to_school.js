"use strict";
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "shadow-speak-school" });
const db = admin.firestore();

function parseArgs() {
  const args = process.argv.slice(2);
  const schoolId = args[0];
  const dryRun = args.includes("--dry-run");
  const prefixArg = args.find((a) => a.startsWith("--prefix="));
  const prefix = prefixArg ? prefixArg.split("=").slice(1).join("=") : null;

  if (!schoolId) {
    console.log("Usage: node tools/copy_master_materials_to_school.js <schoolId> [--dry-run] [--prefix=Level_5_]");
    process.exit(1);
  }
  return { schoolId, dryRun, prefix };
}

async function main() {
  const { schoolId, dryRun, prefix } = parseArgs();

  const srcCol = db.collection("materials");
  const dstCol = db.collection("schools").doc(schoolId).collection("materials");

  console.log("src:", srcCol.path);
  console.log("dst:", dstCol.path);
  console.log("dryRun:", dryRun);
  console.log("prefix:", prefix || "(none)");

  const snap = await srcCol.get();
  const docs = snap.docs.filter((d) => (prefix ? d.id.startsWith(prefix) : true));

  console.log(`found master materials: ${snap.size}, to copy: ${docs.length}`);

  let batch = db.batch();
  let op = 0;

  for (const d of docs) {
    const dstRef = dstCol.doc(d.id);
    const payload = {
      ...d.data(),
      masterMaterialId: d.id,
      copiedAt: admin.firestore.FieldValue.serverTimestamp(),
      enabled: true,
    };
    if (!dryRun) {
      batch.set(dstRef, payload, { merge: true });
      op++;
      if (op >= 450) {
        await batch.commit();
        batch = db.batch();
        op = 0;
      }
    }
    console.log("→", d.id);
  }

  if (!dryRun && op > 0) await batch.commit();
  console.log(`✅ done. copied=${docs.length} (dryRun=${dryRun})`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
