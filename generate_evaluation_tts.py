# functions/generate_evaluation_tts.py

import os
import html
from pathlib import Path
import requests

# ① パス設定（今の構造に合わせてる）
ROOT_DIR = Path(__file__).resolve().parent
EVAL_DIR = ROOT_DIR / "scripts" / "Level5" / "Lesson3" / "D" / "evaluation"

SCRIPT_FILES = [
    ("script2.txt", "listening_test2.wav"),
    # 必要なら ("script2.txt", "listening_test2.wav") みたいに増やせる
]

AZURE_SPEECH_KEY = os.environ["SPEECH_KEY"]      # Azure Speech key
AZURE_SPEECH_REGION = os.environ["SPEECH_REGION"]

if not AZURE_SPEECH_KEY:
    raise RuntimeError("環境変数 AZURE_SPEECH_KEY が設定されていません。")


def synthesize_to_wav(text: str, out_path: Path, rate: float = 0.8):
    """
    与えられた text を Azure TTS (JennyNeural) で WAV にして保存。
    1行目を「Question 1.」などのラベルとみなし、そのあと 2 秒ポーズしてから本文を読む。
    """
    endpoint = f"https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"

    # 1行目: ラベル（Question 1. など）
    # 2行目以降: 本文
    lines = text.splitlines()
    if len(lines) >= 2:
        label = lines[0].strip()
        body = "\n".join(lines[1:]).strip()
        inner_ssml = (
            f"{html.escape(label)}"
            f"<break time=\"2s\"/>"
            f"{html.escape(body)}"
        )
    else:
        # 念のため1行しかない場合はそのまま
        inner_ssml = html.escape(text)

    ssml = f"""
<speak version="1.0" xml:lang="en-US">
  <voice xml:lang="en-US" xml:gender="Female" name="en-US-JennyNeural">
    <prosody rate="{rate}">
      {inner_ssml}
    </prosody>
  </voice>
</speak>
""".strip()

    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",
        "User-Agent": "shadow-speak-evaluation-generator",
    }

    print(f"  🔈 TTS: '{text[:40]}...'")
    resp = requests.post(endpoint, headers=headers, data=ssml.encode("utf-8"))
    resp.raise_for_status()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(resp.content)

    print(f"  ✅ Saved: {out_path.relative_to(ROOT_DIR)}")



    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",
        "User-Agent": "shadow-speak-evaluation-generator",
    }

    print(f"🔈 TTS: {out_path.name}")
    resp = requests.post(endpoint, headers=headers, data=ssml.encode("utf-8"))
    resp.raise_for_status()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(resp.content)

    print(f"✅ Saved: {out_path.relative_to(ROOT_DIR)}")


def main():
    for script_name, wav_name in SCRIPT_FILES:
        script_path = EVAL_DIR / script_name
        out_path = EVAL_DIR / wav_name

        if not script_path.exists():
            print(f"⚠️ {script_path} がありません。スキップします。")
            continue

        text = script_path.read_text(encoding="utf-8").strip()
        synthesize_to_wav(text, out_path, rate=0.8)  # 速度変えたければここ


if __name__ == "__main__":
    main()
