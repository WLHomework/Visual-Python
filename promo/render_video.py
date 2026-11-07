import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
REC = ROOT / "recordings"
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

FPS = 30
W, H = 1080, 1920
TOTAL = 39.5

RENDER_FILE = Path(
    r"C:\Users\Administrator\AppData\Roaming\com.visualpython.desktop\renders"
    r"\hello-manim-HelloManim-20261029-214533.mp4"
)

SEGMENTS = [
    # duration, clip, source start, layout
    (2.0, "02-hello-blocks-clean.mp4", 0.0, "full"),
    (5.04, "02-hello-blocks-clean.mp4", 2.0, "full"),
    (3.46, "02-hello-blocks-clean.mp4", 0.5, "full"),
    (3.5, "02-hello-blocks-clean.mp4", 3.0, "blocks-zoom"),
    (4.54, "02-hello-blocks-clean.mp4", 1.0, "code-pane"),
    (3.74, "render", 0.0, "result"),
    (4.23, "05-hello-edit-clean.mp4", 0.5, "full"),
    (4.436, "02-hello-blocks-clean.mp4", 4.5, "blocks-zoom"),
    (2.054, "render", 0.25, "result"),
]


def run(command: list[str]):
    print(" ".join(command[:8]), "...")
    subprocess.run(command, check=True, capture_output=True)


def layout_filter(layout: str):
    if layout == "full":
        return "crop=1576:760:24:0,scale=1000:482:flags=lanczos", (24, 568, 1032, 514), (40, 580), (1000, 482)
    if layout == "blocks-zoom":
        return "crop=820:320:210:200,scale=980:382:flags=lanczos", (32, 470, 1010, 402), (50, 480), (980, 382)
    if layout == "code-pane":
        return "crop=590:620:1010:70,scale=900:946:flags=lanczos", (76, 390, 928, 966), (90, 400), (900, 946)
    if layout == "result":
        return "scale=1040:585:flags=lanczos", (14, 544, 1052, 601), (20, 552), (1040, 585)
    raise ValueError(layout)


def render_segment(index: int, duration: float, clip: str, start: float, layout: str):
    target = BUILD / f"seg-{index:02d}.mp4"
    is_render = clip == "render"
    source = RENDER_FILE if is_render else REC / clip
    crop, panel, fg_pos, fg_size = layout_filter(layout)
    shadow_x, shadow_y, shadow_w, shadow_h = panel
    fg_x, fg_y = fg_pos
    fg_w, fg_h = fg_size

    filter_complex = (
        f"[1:v]{crop},setsar=1,eq=contrast=1.05:saturation=1.06,"
        "tpad=stop_mode=clone:stop_duration=4[fg];"
        f"[0:v]scale={W}:{H},setsar=1[bg];"
        f"[bg]drawbox=x={shadow_x}:y={shadow_y}:w={shadow_w}:h={shadow_h}:"
        "color=black@0.55:t=fill[base];"
        f"[base][fg]overlay={fg_x}:{fg_y}:eof_action=repeat,"
        f"drawbox=x={fg_x - 2}:y={fg_y - 2}:w={fg_w + 4}:h={fg_h + 4}:"
        "color=0x2DD4BF@0.35:t=2,"
        f"drawbox=x={fg_x}:y={fg_y}:w={fg_w}:h={fg_h}:"
        "color=0x94A3B8@0.15:t=1,"
        "format=yuv420p[v]"
    )

    command = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(ASSETS / "bg.png"),
    ]
    if is_render:
        command += ["-stream_loop", "-1"]
    command += [
        "-ss",
        str(start),
        "-t",
        str(duration + 0.3),
        "-i",
        str(source),
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-t",
        str(duration),
        "-r",
        str(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-an",
        str(target),
    ]
    run(command)
    return target


def render_end_card():
    target = BUILD / "seg-99.mp4"
    command = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(ASSETS / "end-card.png"),
        "-filter_complex",
        (
            f"[0:v]scale={W}:{H},setsar=1,"
            "fade=t=in:st=0:d=0.35,"
            "fade=t=out:st=6.05:d=0.45,"
            "format=yuv420p[v]"
        ),
        "-map",
        "[v]",
        "-t",
        "6.5",
        "-r",
        str(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-an",
        str(target),
    ]
    run(command)
    return target


def concat_segments(paths: list[Path]):
    list_file = BUILD / "segments.txt"
    list_file.write_text(
        "\n".join(f"file '{path.as_posix()}'" for path in paths), encoding="utf-8"
    )
    target = BUILD / "visual.mp4"
    command = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_file),
        "-c",
        "copy",
        str(target),
    ]
    run(command)
    return target


def mux(visual: Path):
    target = ROOT / "VisualPython-Manin-40s-v1.mp4"
    filter_complex = (
        "[0:v]fade=t=in:st=0:d=0.35,fade=t=out:st=38.55:d=0.8[base];"
        "[base]ass=promo/build/captions.ass[v];"
        "[1:a]atrim=0:39.5,apad=pad_dur=7,volume=1.0[voice];"
        "[2:a]volume=0.9[music];"
        "[voice][music]amix=inputs=2:duration=longest:normalize=0,"
        "alimiter=limit=0.98,aresample=48000,"
        "pan=stereo|c0=c0|c1=c0[a]"
    )
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(visual),
        "-i",
        str(BUILD / "voice.wav"),
        "-i",
        str(BUILD / "music.wav"),
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        str(TOTAL),
        "-r",
        str(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(target),
    ]
    run(command)
    return target


def main():
    paths = [
        render_segment(index, duration, clip, start, layout)
        for index, (duration, clip, start, layout) in enumerate(SEGMENTS, start=1)
    ]
    paths.append(render_end_card())
    visual = concat_segments(paths)
    final = mux(visual)
    print(final)


if __name__ == "__main__":
    main()


