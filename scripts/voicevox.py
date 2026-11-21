"""Generate the reading audio with a local VOICEVOX engine.

Start the VOICEVOX engine (or the VOICEVOX app) first, then run:

    python scripts/voicevox.py [--parts kami,shimo,kaisetsu] [poem numbers...]

Writes web/voice/<voice>/<NNN>-<part>.mp3 for every poem and voice:
kami/shimo are the 上の句/下の句, kaisetsu is the ずかん explanation.
ffmpeg is required. Pass --check to print the explanation text as spoken
instead of generating audio.
"""

import argparse
import json
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ENGINE = "http://127.0.0.1:50021"
ROOT = Path(__file__).resolve().parent.parent
VOICES = {"zundamon": 3, "metan": 2, "tsumugi": 8}

# 聞き取りやすいよう、句ごとに少し間を取って、ややゆっくり普通に読む。
SPEED = 0.9
PHRASE_PAUSE = 0.45  # 句と句のあいだ（秒）
EXPLANATION_SPEED = 0.95

# 解説の音声だけで使う読み。エンジンが読みまちがえる語を、ひらがなに置きかえる。
READINGS = {
    "三室の": "みむろの", "丹後": "たんご", "「八重」": "「やえ」", "千々": "ちぢ",
    "坂上是則": "さかのうえのこれのり", "壬生忠見": "みぶのただみ", "大弐三位": "だいにのさんみ",
    "大江千里": "おおえのちさと", "宇多": "うだ", "小倉山": "おぐらやま", "尾上": "おのえ",
    "山道": "やまみち", "式子内親王": "しょくしないしんのう", "文屋康秀": "ふんやのやすひで",
    "文屋朝康": "ふんやのあさやす", "春日": "かすが", "有馬山": "ありまやま",
    "河原左大臣": "かわらのさだいじん", "浅茅生": "あさじう", "源融": "みなもとのとおる",
    "瀬々": "せぜ", "田子の浦": "たごのうら", "白一色": "しろいっしょく", "白雪": "しらゆき",
    "皇女": "こうじょ", "稲羽山": "いなばやま", "紅色": "べにいろ", "紅葉": "もみじ",
    "藤原伊尹": "ふじわらのこれただ", "藤原俊成": "ふじわらのしゅんぜい", "藤原定家": "ふじわらのていか",
    "藤原忠通": "ふじわらのただみち", "手向山": "たむけやま", "難波": "なにわ", "実朝": "さねとも",
    "夜半": "よわ", "名歌": "めいか", "一夜": "ひとよ", "庵": "いおり", "天の原": "あまのはら",
    "奈良の都": "ならのみやこ", "大中臣能宣": "おおなかとみのよしのぶ", "清原元輔": "きよはらのもとすけ",
}

# 歴史的かなづかいの読みかたの例外（規則で直すと、かえってまちがう語）。
KANA_EXCEPTIONS = {"ちわやぶる": "ちはやぶる", "おわやみ": "をはやみ", "いまわた": "いまはた",
                   "のいま": "のひま", "のおか": "のほか", "まつお": "まつほ",
                   "もみじうみ": "もみじふみ", "ぞうけ": "ぞふけ", "ちじに": "ちぢに"}


def modern_kana(text):
    """歴史的かなづかいを、声に出すときの読みにする（ひらがなの部分だけ）。"""
    text = text.replace("てふ", "ちょう").replace("けふ", "きょう")
    text = text.translate(str.maketrans("ゐゑをぢづ", "いえおじず"))
    text = re.sub(r"(?<=[ぁ-ゖ思言])[はひふへほ]", lambda m: "わいうえお"["はひふへほ".index(m[0])], text)
    for wrong, right in KANA_EXCEPTIONS.items():
        text = text.replace(wrong, right.replace("を", "お"))
    return text


def spoken(text):
    for word, reading in READINGS.items():
        text = text.replace(word, reading)
    return text


def explanation(entry):
    meaning, words, notes = entry[4], entry[5], entry[6]
    lines = []
    for item in words.split("／"):
        word, detail = item.split("：", 1)
        lines.append(f"{modern_kana(word)}。{detail}。")
    notes = re.sub(r"「([ぁ-ゖ]+)」", lambda m: f"「{modern_kana(m[1])}」", notes)
    return spoken(f"いみ。{meaning}\nことば。\n" + "\n".join(lines) + f"\nかいせつ。{notes}")


def post(path, params, body=None):
    url = f"{ENGINE}{path}?{urllib.parse.urlencode(params)}"
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request) as response:
        return response.read()


def reading_query(phrases, speaker):
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
    for accent in accents:
        if accent["pause_mora"]:
            accent["pause_mora"]["vowel_length"] = PHRASE_PAUSE
    query.update(speedScale=SPEED)
    return query


def synthesize(query, speaker, target, bitrate):
    query.update(prePhonemeLength=0.3, postPhonemeLength=0.6, outputSamplingRate=24000, outputStereo=False)
    wav = post("/synthesis", {"speaker": speaker}, query)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(wav)
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", tmp.name, "-ac", "1", "-b:a", bitrate, str(target)],
        check=True,
    )
    Path(tmp.name).unlink()
    print(target.relative_to(ROOT))


def explanation_wav_query(text, speaker):
    # 段落の区切りは「、」にして、少し間を取る。
    query = json.loads(post("/audio_query", {"text": text.replace("\n", "、"), "speaker": speaker}))
    query.update(speedScale=EXPLANATION_SPEED)
    return query


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--parts", default="kami,shimo,kaisetsu")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("numbers", nargs="*", type=int)
    args = parser.parse_args()
    poems = [line.split("\t") for line in (ROOT / "data/poems.tsv").read_text(encoding="utf-8").splitlines()]
    catalog = [line.split("\t") for line in (ROOT / "data/catalog.tsv").read_text(encoding="utf-8").splitlines()]
    numbers = sorted(set(args.numbers)) or range(1, len(poems) + 1)
    parts = args.parts.split(",")
    if args.check:
        for number in numbers:
            print(f"--- {number}\n{explanation(catalog[number - 1])}")
        return
    for name, speaker in VOICES.items():
        out_dir = ROOT / "web/voice" / name
        out_dir.mkdir(parents=True, exist_ok=True)
        for number in numbers:
            for part, column in (("kami", 2), ("shimo", 3)):
                if part in parts:
                    query = reading_query(poems[number - 1][column].split("　"), speaker)
                    synthesize(query, speaker, out_dir / f"{number:03}-{part}.mp3", "48k")
            if "kaisetsu" in parts:
                query = explanation_wav_query(explanation(catalog[number - 1]), speaker)
                synthesize(query, speaker, out_dir / f"{number:03}-kaisetsu.mp3", "32k")


if __name__ == "__main__":
    main()
