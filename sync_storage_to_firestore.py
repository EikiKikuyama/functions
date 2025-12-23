import firebase_admin
from firebase_admin import credentials, firestore, storage

# ==============================
# 🔹 Firebase 初期化
# ==============================
cred = credentials.Certificate(
    "/Users/kikuyama/ShadowSpeak/shadow_speak_v3/shadow-speak-school-firebase-adminsdk-fbsvc-d73160645a.json"
)

# ✅ initialize_app() を必ずここで呼ぶ！
firebase_admin.initialize_app(cred, {
    'storageBucket': 'shadow-speak-school.firebasestorage.app'  # ← バケット名を確認！
})

db = firestore.client()
bucket = storage.bucket()
SCHOOL_ID = "Obu-high"

# ==============================
# 🔹 Storage → Firestore 同期
# ==============================
def sync_storage_to_firestore():
    blobs = bucket.list_blobs(prefix="assets/audio/")
    count = 0

    for blob in blobs:
        if not blob.name.endswith(".wav"):
            continue

        # 例: assets/audio/Level2/Announcement/Platform_Change_Notice.wav
        parts = blob.name.split("/")
        if len(parts) < 4:
            continue

        level, category, filename = parts[2], parts[3], parts[4].replace(".wav", "")
        doc_id = f"{level}_{category}_{filename}"

        # Firestore登録データを構築
        data = {
            "id": doc_id,
            "level": level,
            "category": category,
            "title": filename.replace("_", " "),
            "visible": True,
            "paths": {
                "audio": f"assets/audio/{level}/{category}/{filename}.wav",
                "script": f"assets/scripts/{level}/{category}/{filename}.txt",
                "subtitles": f"assets/subtitles/{level}/{category}/{filename}.json",
                "translation": f"assets/translations/{level}/{category}/{filename}_ja.json",
            }
        }

        # Firestoreに保存
        db.collection("schools").document(SCHOOL_ID).collection("materials").document(doc_id).set(data)
        print(f"✅ Synced: {doc_id}")
        count += 1

    print(f"🎉 Firestore updated for {count} materials.")


if __name__ == "__main__":
    sync_storage_to_firestore()
