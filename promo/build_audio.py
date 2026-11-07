import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
AUDIO = ROOT / "audio"
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

VOICE = "xiaoxiao"
LINES = [
    ("01-hook", 2.0),
    ("02-blocks", 7.04),
    ("03-drag", 10.5),
    ("04-render", 18.54),
    ("05-edit", 22.28),
    ("06-invite", 26.51),
    ("07-brand", 30.946),
]
TOTAL = 39.5


def build_voice():
    inputs = []
    filters = []
    labels = []
    for index, (line, offset) in enumerate(LINES):
        path = AUDIO / f"{line}-{VOICE}.mp3"
        inputs.extend(["-i", str(path)])
        delay = round(offset * 1000)
        filters.append(f"[{index}:a]adelay={delay}|{delay},volume=1.0[v{index}]")
        labels.append(f"[v{index}]")
    filter_complex = ";".join(filters)
    filter_complex += (
        f";{''.join(labels)}amix=inputs={len(LINES)}:duration=longest:normalize=0,"
        "aresample=48000,loudnorm=I=-15:TP=-1.5:LRA=11[out]"
    )
    command = [
        "ffmpeg",
        "-y",
        *inputs,
        "-filter_complex",
        filter_complex,
        "-map",
        "[out]",
        "-t",
        str(TOTAL),
        "-c:a",
        "pcm_s16le",
        str(BUILD / "voice.wav"),
    ]
    subprocess.run(command, check=True, capture_output=True)


def build_music():
    command = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=220:duration={TOTAL}:sample_rate=48000",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=277.18:duration={TOTAL}:sample_rate=48000",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=329.63:duration={TOTAL}:sample_rate=48000",
        "-filter_complex",
        "[0:a]volume=0.028[a0];[1:a]volume=0.020[a1];[2:a]volume=0.016[a2];"
        "[a0][a1][a2]amix=inputs=3:normalize=0,"
        "lowpass=f=1200,tremolo=f=0.12:d=0.25,"
        f"afade=t=in:st=0:d=2,afade=t=out:st={TOTAL - 3}:d=3,"
        "aformat=channel_layouts=stereo[out]",
        "-map",
        "[out]",
        "-t",
        str(TOTAL),
        "-c:a",
        "pcm_s16le",
        str(BUILD / "music.wav"),
    ]
    subprocess.run(command, check=True, capture_output=True)


def build_captions():
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Microsoft YaHei,58,&H00FFFFFF,&H000000FF,&H000A0A0A,&H99000000,-1,0,0,0,100,100,1,0,4,7,0,2,50,50,0,1
Style: Hook,Microsoft YaHei,84,&H00FFFFFF,&H000000FF,&H000A0A0A,&H99000000,-1,0,0,0,100,100,2,0,4,9,0,2,50,50,0,1
Style: Brand,Microsoft YaHei,31,&H00FFFFFF,&H000000FF,&H000A0A0A,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,7,60,60,78,1
Style: BrandSub,Microsoft YaHei,23,&H00D7FFD7,&H000000FF,&H000A0A0A,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,9,60,60,88,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = [
        (0.0, 33.0, "Brand", r"{\an7\pos(60,78)}Visual Python"),
        (0.0, 33.0, "BrandSub", r"{\an9\pos(1020,88)}Manim × 积木"),
        (0.0, 2.0, "Hook", r"{\an2\pos(540,1450)}Manim 很强"),
        (2.0, 4.5, "Caption", "Manim 是数学动画的天花板"),
        (4.5, 7.04, "Caption", r"{\an2\pos(540,1450)}但我不会 {\c&H00D7FF&}Python{\c&HFFFFFF&}"),
        (7.04, 10.5, "Caption", "所以，我把它做成了积木"),
        (10.5, 13.3, "Caption", "拖一个场景"),
        (13.3, 16.0, "Caption", "拖一个文字，再拖一个动画"),
        (16.0, 18.45, "Caption", "右边，就是真正的 Manim 代码"),
        (18.54, 20.8, "Caption", "点一下渲染"),
        (20.8, 22.28, "Caption", "动画真的跑起来了"),
        (22.28, 24.5, "Caption", "每一块都能改"),
        (24.5, 26.5, "Caption", "每一行代码都能看懂"),
        (26.51, 30.9, "Caption", "不会 Python，也能让数学动起来"),
        (30.946, 33.0, "Caption", "这是 Visual Python"),
    ]

    def timestamp(seconds: float) -> str:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        rest = seconds % 60
        return f"{hours}:{minutes:02d}:{rest:05.2f}"

    lines = [header]
    for start, end, style, text in events:
        lines.append(
            f"Dialogue: 0,{timestamp(start)},{timestamp(end)},{style},,0,0,0,,{text}"
        )
    (BUILD / "captions.ass").write_text("\n".join(lines), encoding="utf-8")


def main():
    build_voice()
    build_music()
    build_captions()
    print(json.dumps({"voice": VOICE, "total": TOTAL}, ensure_ascii=False))


if __name__ == "__main__":
    main()
