# functions/generate_dictation_clips.py

import os
import json
import re
import html
from pathlib import Path

import requests  # pip install requests

# ============================
# 🔧 設定
# ============================

# このファイル（generate_dictation_clips.py）の場所を基準にパスを作る
ROOT_DIR = Path(__file__).resolve().parent
LESSON_DIR = ROOT_DIR / "scripts"  / "Level5" / "Lesson3" / "D"

DICTATION_JSON_PATH = LESSON_DIR / "dictation.json"
OUTPUT_BASE_DIR = LESSON_DIR / "dictation_audio"

# Azure Speech のキーとリージョンは環境変数から読む
AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION", "japaneast")

if not AZURE_SPEECH_KEY:
  raise RuntimeError("環境変数 AZURE_SPEECH_KEY が設定されていません。")


# ============================
# 🧠 空所（______）を answers で埋める
# ============================

def fill_blanks(template: str, answers: list[str]) -> str:
    """
    sentence / sentence1 / sentence2 の中の ______ を
    answers で前から順番に埋めていく。
    アンダースコアの長さは 3 個以上なら何でも OK にしている。
    """
    idx = 0

    def repl(match: re.Match) -> str:
        nonlocal idx
        if idx < len(answers):
            word = answers[idx]
            idx += 1
            return word
        # 予想外に blanks が多かった場合はそのまま残す
        return match.group(0)

    # ___ 以上の連続アンダースコアを置換対象にする
    filled = re.sub(r"_{3,}", repl, template)
    # 空白がダブついたところを軽く整形
    filled = re.sub(r"\s+", " ", filled).strip()
    return filled


def build_question_text(part: str, q: dict) -> str:
    """
    DictationQuestion ごとに TTS に投げる最終英文を作る。
    - Part A / C: sentence + answers
    - Part B: sentence1 + sentence2 + answers
    """
    answers = q.get("answers", [])

    if part in ("A", "C"):
        sentence = q["sentence"]
        return fill_blanks(sentence, answers)

    if part == "B":
        s1 = q["sentence1"]
        s2 = q["sentence2"]
        # 2 文をつなげてから一気に blanks を埋める
        combined = f"{s1} {s2}"
        return fill_blanks(combined, answers)

    raise ValueError(f"Unknown part: {part}")


# ============================
# 🔊 Azure TTS で WAV 生成
# ============================

def synthesize_to_wav(text: str, out_path: Path):
    """
    与えられた text を Azure TTS (JennyNeural) で WAV にして保存。
    """
    endpoint = f"https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"

    # SSML で送る
    ssml = f"""
<speak version="1.0" xml:lang="en-US">
  <voice xml:lang="en-US" xml:gender="Female" name="en-US-JennyNeural">
  <prosody rate="0.8">
    {html.escape(text)}
    </prosody>
  </voice>
</speak>
""".strip()

    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",
        "User-Agent": "shadow-speak-dictation-generator",
    }

    print(f"  🔈 TTS: '{text}'")
    resp = requests.post(endpoint, headers=headers, data=ssml.encode("utf-8"))

    if resp.status_code != 200:
        raise RuntimeError(
            f"TTS 失敗: HTTP {resp.status_code} - {resp.text[:200]}"
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(resp.content)

    print(f"  ✅ Saved: {out_path.relative_to(ROOT_DIR)}")


# ============================
# 🚀 メイン処理
# ============================

def main():
    print(f"📄 Loading dictation json: {DICTATION_JSON_PATH}")
    with open(DICTATION_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    lesson_id = data.get("lessonId", "UNKNOWN")
    parts = data["parts"]  # A / B / C

    for part_label, questions in parts.items():
        print(f"\n=== Part {part_label} ===")
        for q in questions:
            qid = q["id"]  # A1, A2, ...
            text = build_question_text(part_label, q)

            # 例: scripts/Levels/Level5/Lesson3/dictation_audio/A/A1.wav
            out_path = OUTPUT_BASE_DIR / part_label / f"{qid}.wav"
            print(f"▶ {lesson_id} / Part {part_label} / {qid}")
            synthesize_to_wav(text, out_path)

    print("\n🎉 All dictation clips generated!")


if __name__ == "__main__":
    main()
