from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FRAME = ROOT / "build" / "final-01.png"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REGULAR = r"C:\Windows\Fonts\msyh.ttc"

image = Image.open(FRAME).convert("RGBA")
W, H = image.size
overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)

# Darken the top area just enough for readable typography.
for y in range(0, 560):
    alpha = int(210 * (1 - y / 560))
    draw.rectangle((0, y, W, y + 1), fill=(4, 9, 15, alpha))

title_font = ImageFont.truetype(FONT_BOLD, 104)
accent_font = ImageFont.truetype(FONT_BOLD, 104)
sub_font = ImageFont.truetype(FONT_REGULAR, 34)


def centered(text: str, y: int, font, fill):
    width = draw.textlength(text, font=font)
    draw.text(((W - width) / 2, y), text, font=font, fill=fill)


centered("不会 Python", 170, title_font, (248, 250, 252, 255))
centered("也能做 Manim", 300, accent_font, (45, 212, 191, 255))
centered("Visual Python · 图形化 Manim", 460, sub_font, (203, 213, 225, 255))

image = Image.alpha_composite(image, overlay).convert("RGB")
image.save(ROOT / "cover.png", optimize=True)
print(ROOT / "cover.png")

# SRT for B站/抖音上传（可选外挂字幕）
events = [
    (0.0, 2.0, "Manim 很强"),
    (2.0, 7.0, "但我不会 Python"),
    (7.04, 10.5, "所以，我把它做成了积木"),
    (10.5, 13.3, "拖一个场景"),
    (13.3, 16.0, "拖一个文字，再拖一个动画"),
    (16.0, 18.45, "右边，就是真正的 Manim 代码"),
    (18.54, 20.8, "点一下渲染"),
    (20.8, 22.28, "动画真的跑起来了"),
    (22.28, 24.5, "每一块都能改"),
    (24.5, 26.5, "每一行代码都能看懂"),
    (26.51, 30.9, "不会 Python，也能让数学动起来"),
    (30.946, 33.0, "这是 Visual Python"),
]


def ts(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    rest = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{rest:06.3f}".replace(".", ",")


lines = []
for index, (start, end, text) in enumerate(events, start=1):
    lines.append(str(index))
    lines.append(f"{ts(start)} --> {ts(end)}")
    lines.append(text)
    lines.append("")
(ROOT / "captions.srt").write_text("\n".join(lines), encoding="utf-8")
print(ROOT / "captions.srt")
