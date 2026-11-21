"""Generate the 上の句・下の句 reading audio with a local VOICEVOX engine.

Start the VOICEVOX engine (or the VOICEVOX app) first, then run:

    python scripts/voicevox.py [poem numbers...]

Writes web/voice/<voice>/<NNN>-kami.mp3 and <NNN>-shimo.mp3 for every poem and voice. ffmpeg is required.
"""

import json
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ENGINE = "http://127.0.0.1:50021"
ROOT = Path(__file__).resolve().parent.parent
VOICES = {"zundamon": 3, "metan": 2, "tsumugi": 8}

# かるたの読み: ゆっくり、抑揚を抑え、各句の終わりを長くのばして間を取る。
SPEED = 0.82
INTONATION = 0.35
PHRASE_END = 0.62  # 句末の母音の長さ（秒）
PHRASE_PAUSE = 0.55  # 句と句のあいだ（秒）


def post(path, params, body=None):
    url = f"{ENGINE}{path}?{urllib.parse.urlencode(params)}"
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request) as response:
        return response.read()


def karuta_query(phrases, speaker):
    query = json.loads(post("/audio_query", {"text": "、".join(phrases), "speaker": speaker}))
    accents = query["accent_phrases"]
    # 読みどおりの「は」を、助詞と取り違えて「ワ」にした音を直す（いまはた、せをはやみ など）。
    want = "".join(chr(ord(c) + 96) if "ぁ" <= c <= "ゖ" else c for c in "".join(phrases))
    position = 0
    for accent in accents:
        for mora in accent["moras"]:
            if mora["text"] == "ワ" and want[position:position + 1] == "ハ":
                mora.update(text="ハ", consonant="h", consonant_length=mora["consonant_length"] or 0.06)
            position += len(mora["text"])
    # 「、」で区切られた句の終わりにあたるアクセント句を探す。
    ends = [i for i, accent in enumerate(accents) if accent["pause_mora"]] + [len(accents) - 1]
    for i in ends:
        mora = accents[i]["moras"][-1]
        mora["vowel_length"] = max(mora["vowel_length"], PHRASE_END)
        if accents[i]["pause_mora"]:
            accents[i]["pause_mora"]["vowel_length"] = PHRASE_PAUSE
    query.update(
        speedScale=SPEED,
        intonationScale=INTONATION,
        prePhonemeLength=0.3,
        postPhonemeLength=0.6,
        outputSamplingRate=24000,
        outputStereo=False,
    )
    return query


def main():
    poems = [line.split("\t") for line in (ROOT / "data/poems.tsv").read_text(encoding="utf-8").splitlines()]
    wanted = {int(n) for n in sys.argv[1:]} or set(range(1, len(poems) + 1))
    for name, speaker in VOICES.items():
        out_dir = ROOT / "web/voice" / name
        out_dir.mkdir(parents=True, exist_ok=True)
        for number, (half, column) in ((n, h) for n in sorted(wanted) for h in (("kami", 2), ("shimo", 3))):
            phrases = poems[number - 1][column].split("　")
            wav = post("/synthesis", {"speaker": speaker}, karuta_query(phrases, speaker))
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(wav)
            target = out_dir / f"{number:03}-{half}.mp3"
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", tmp.name, "-ac", "1", "-b:a", "48k", str(target)],
                check=True,
            )
            Path(tmp.name).unlink()
            print(target.relative_to(ROOT))


if __name__ == "__main__":
    main()
