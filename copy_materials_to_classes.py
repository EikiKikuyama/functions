import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate(
    "/Users/kikuyama/ShadowSpeak/shadow_speak_v3/shadow-speak-school-firebase-adminsdk-fbsvc-d73160645a.json"
)
firebase_admin.initialize_app(cred)

db = firestore.client()

SCHOOL_ID = "Obu-high"

def copy_materials_to_classes():
    # 🔹 全クラスを取得
    classes_ref = db.collection("schools").document(SCHOOL_ID).collection("classes")
    classes = list(classes_ref.stream())

    # 🔹 共通 materials
    materials_ref = db.collection("schools").document(SCHOOL_ID).collection("materials")
    materials = list(materials_ref.stream())

    print(f"📚 Classes: {len(classes)} / Materials: {len(materials)}")

    for cls in classes:
        class_id = cls.id
        print(f"\n🏫 Copying materials to class: {class_id}")

        count = 0
        for mat in materials:
            material_data = mat.to_dict()

            # ⚠️ idフィールドが存在しない場合は、ドキュメントIDを代わりに使う
            material_id = material_data.get("id", mat.id)

            # Firestore に保存
            db.collection("schools").document(SCHOOL_ID)\
                .collection("classes").document(class_id)\
                .collection("materials").document(material_id).set(material_data)

            count += 1

        print(f"✅ Copied {count} materials to {class_id}")

    print("\n🎉 All class materials copied successfully!")

if __name__ == "__main__":
    copy_materials_to_classes()
