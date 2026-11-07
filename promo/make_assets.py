from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)

W, H = 1080, 1920
SCALE = 2
W2, H2 = W * SCALE, H * SCALE

FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REGULAR = r"C:\Windows\Fonts\msyh.ttc"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size * SCALE)


def vertical_gradient(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGB", (W2, H2), top)
    pixels = image.load()
    for y in range(H2):
        ratio = y / (H2 - 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        for x in range(W2):
            pixels[x, y] = color
    return image


def add_glow(image: Image.Image, center: tuple[int, int], radius: int, color: tuple[int, int, int], alpha: int):
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*color, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius // 2))
    image.alpha_composite(layer)


def draw_grid(draw: ImageDraw.ImageDraw):
    step = 72 * SCALE
    color = (120, 190, 190, 16)
    for x in range(0, W2, step):
        draw.line((x, 0, x, H2), fill=color, width=max(1, SCALE // 2))
    for y in range(0, H2, step):
        draw.line((0, y, W2, y), fill=color, width=max(1, SCALE // 2))


def build_background() -> Image.Image:
    base = vertical_gradient((6, 10, 16), (10, 18, 30)).convert("RGBA")
    add_glow(base, (W2 - 140 * SCALE, 260 * SCALE), 420 * SCALE, (13, 148, 136), 70)
    add_glow(base, (60 * SCALE, H2 - 360 * SCALE), 460 * SCALE, (76, 29, 149), 58)
    add_glow(base, (W2 // 2, H2 // 2), 560 * SCALE, (14, 116, 144), 26)
    draw_grid(ImageDraw.Draw(base))
    return base


def draw_centered(draw: ImageDraw.ImageDraw, y: int, text: str, font_obj, fill, tracking: int = 0):
    if tracking:
        widths = [draw.textlength(ch, font=font_obj) for ch in text]
        total = sum(widths) + tracking * SCALE * (len(text) - 1)
        x = (W2 - total) / 2
        for ch, width in zip(text, widths):
            draw.text((x, y), ch, font=font_obj, fill=fill)
            x += width + tracking * SCALE
    else:
        width = draw.textlength(text, font=font_obj)
        draw.text(((W2 - width) / 2, y), text, font=font_obj, fill=fill)


def build_end_card(background: Image.Image) -> Image.Image:
    image = background.copy()
    draw = ImageDraw.Draw(image)

    frame = (255, 255, 255, 26)
    inset = 54 * SCALE
    length = 84 * SCALE
    width = 2 * SCALE
    for x, y, dx, dy in (
        (inset, inset, 1, 1),
        (W2 - inset, inset, -1, 1),
        (inset, H2 - inset, 1, -1),
        (W2 - inset, H2 - inset, -1, -1),
    ):
        draw.line((x, y, x + dx * length, y), fill=frame, width=width)
        draw.line((x, y, x, y + dy * length), fill=frame, width=width)

    label_font = font(FONT_BOLD, 24)
    label = "V I S U A L   P Y T H O N"
    label_width = draw.textlength(label, font=label_font)
    pill = (W2 / 2 - label_width / 2 - 28 * SCALE, 420 * SCALE, W2 / 2 + label_width / 2 + 28 * SCALE, 488 * SCALE)
    draw.rounded_rectangle(pill, radius=34 * SCALE, fill=(13, 148, 136, 44), outline=(45, 212, 191, 120), width=1 * SCALE)
    draw.text((W2 / 2 - label_width / 2, 438 * SCALE), label, font=label_font, fill=(153, 246, 228, 255))

    hero_white = font(FONT_BOLD, 132)
    hero_teal = font(FONT_BOLD, 154)
    draw_centered(draw, 600 * SCALE, "不会 Python", hero_white, (248, 250, 252, 255), tracking=1)
    draw_centered(draw, 790 * SCALE, "也能做 Manim", hero_teal, (45, 212, 191, 255), tracking=-1)

    sub_font = font(FONT_REGULAR, 40)
    draw_centered(draw, 1000 * SCALE, "把数学动画，从代码里解放出来", sub_font, (203, 213, 225, 255))

    chip_font = font(FONT_BOLD, 30)
    chips = ["积木编辑", "实时代码", "一键渲染"]
    gap = 18 * SCALE
    widths = [draw.textlength(text, font=chip_font) + 44 * SCALE for text in chips]
    total = sum(widths) + gap * (len(chips) - 1)
    x = (W2 - total) / 2
    y = 1120 * SCALE
    for text, width in zip(chips, widths):
        draw.rounded_rectangle(
            (x, y, x + width, y + 70 * SCALE),
            radius=35 * SCALE,
            fill=(10, 32, 38, 235),
            outline=(45, 212, 191, 90),
            width=1 * SCALE,
        )
        draw.text((x + 22 * SCALE, y + 15 * SCALE), text, font=chip_font, fill=(226, 245, 242, 255))
        x += width + gap

    draw.line((W2 / 2 - 210 * SCALE, 1310 * SCALE, W2 / 2 + 210 * SCALE, 1310 * SCALE), fill=(45, 212, 191, 90), width=2 * SCALE)

    brand_font = font(FONT_BOLD, 58)
    draw_centered(draw, 1480 * SCALE, "Visual Python", brand_font, (248, 250, 252, 255))
    tagline_font = font(FONT_REGULAR, 30)
    draw_centered(draw, 1570 * SCALE, "桌面端图形化编程 · 让每一行代码看得见", tagline_font, (148, 163, 184, 255))

    mark = 86 * SCALE
    mx, my = W2 / 2 - mark / 2, 1370 * SCALE
    draw.rounded_rectangle((mx, my, mx + mark, my + mark), radius=22 * SCALE, fill=(13, 148, 136, 255))
    mark_font = font(FONT_BOLD, 36)
    mark_text = "Py"
    bw = draw.textlength(mark_text, font=mark_font)
    draw.text((mx + (mark - bw) / 2, my + 18 * SCALE), mark_text, font=mark_font, fill=(255, 255, 255, 255))

    return image


def main():
    background = build_background()
    background.resize((W, H), Image.LANCZOS).save(OUT / "bg.png", optimize=True)
    end_card = build_end_card(background)
    end_card.resize((W, H), Image.LANCZOS).save(OUT / "end-card.png", optimize=True)


if __name__ == "__main__":
    main()
