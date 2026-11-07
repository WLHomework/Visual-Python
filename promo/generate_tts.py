import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent
AUDIO = ROOT / "audio"
AUDIO.mkdir(exist_ok=True)

LINES = [
    ("01-hook", "Manim 是数学动画的天花板，但我不会 Python。"),
    ("02-blocks", "所以，我把它做成了积木。"),
    ("03-drag", "拖一个场景，拖一个文字，再拖一个动画。右边，就是真正的 Manim 代码。"),
    ("04-render", "点一下渲染，动画真的跑起来了。"),
    ("05-edit", "每一块都能改，每一行代码都能看懂。"),
    ("06-cta", "不会 Python，也能让数学动起来。这是 Visual Python。"),
]

VOICES = {
    "xiaoxiao": "zh-CN-XiaoxiaoNeural",
    "yunxi": "zh-CN-YunxiNeural",
    "yunjian": "zh-CN-YunjianNeural",
}


async def generate_all():
    async def one(voice_key: str, line_id: str, text: str):
        target = AUDIO / f"{line_id}-{voice_key}.mp3"
        communicate = edge_tts.Communicate(text, VOICES[voice_key], rate="+2%")
        await communicate.save(str(target))
        duration = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(target),
            ],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        return {
            "voice": voice_key,
            "line": line_id,
            "path": str(target),
            "seconds": round(float(duration), 2),
            "text": text,
        }

    tasks = [
        one(voice_key, line_id, text)
        for voice_key in VOICES
        for line_id, text in LINES
    ]
    results = await asyncio.gather(*tasks)
    results.sort(key=lambda item: (item["voice"], item["line"]))
    (AUDIO / "durations.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    for item in results:
        print(f'{item["voice"]:8} {item["line"]:10} {item["seconds"]:5.2f}s')


asyncio.run(generate_all())
