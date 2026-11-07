# Visual Python 宣传片（抖音 40 秒 v1）

## 成片

- 视频：`promo/VisualPython-Manin-40s-v1.mp4`（1080×1920，30fps，39.5s，H.264/AAC 立体声）
- 封面：`promo/cover.png`
- 字幕：`promo/captions.srt`（外挂）；硬字幕已烧录在成片
- 脚本：`promo/douyin-40s-script.md`

## 结构

| 时间 | 旁白 | 画面 |
| --- | --- | --- |
| 0–2s | （无旁白，标题） | 黑底标题「Manim 很强」 |
| 2–7s | Manim 是数学动画的天花板，但我不会 Python | 真实 App：Hello Manim 积木 + 代码 |
| 7–10.5s | 所以，我把它做成了积木 | App 分屏全景 |
| 10.5–16s | 拖一个场景 / 拖一个文字，再拖一个动画 | 积木特写 |
| 16–18.5s | 右边，就是真正的 Manim 代码 | 代码面板特写 |
| 18.5–22.3s | 点一下渲染 / 动画真的跑起来了 | Manim 渲染输出「Hello Manim」 |
| 22.3–26.5s | 每一块都能改 / 每一行代码都能看懂 | 修改字号 56→96→56，代码同步 |
| 26.5–31s | 不会 Python，也能让数学动起来 | 积木特写 |
| 31–33s | 这是 Visual Python | 渲染输出 |
| 33–39.5s | （音乐落版） | 品牌落版 |

## 重建

```powershell
# 1. 生成配音、音乐与 ASS 字幕
python promo/build_audio.py

# 2. 合成画面、烧字幕、混音
python promo/render_video.py
```

依赖：`ffmpeg`、`edge-tts`。配音默认 `zh-CN-XiaoxiaoNeural`；`promo/audio/` 下已有 yunxi / yunjian 的试听样音，可在 `promo/build_audio.py` 里改 `VOICE` 后重建。

## 素材来源

- App 录屏：Hello Manim 示例，1600×1000，真实 Tauri 窗口；后期裁掉桌面边缘与底部任务栏。
- 渲染结果：`%APPDATA%\com.visualpython.desktop\renders\hello-manim-HelloManim-*.mp4`（Manim 实际输出）。
- 修改演示：Hello Manim 的「字号」积木字段，56 → 96 → 56，右侧 Python 代码同步更新。

## 已知限制

- 这是 v1，只有竖屏 40 秒；B 站 4:30 版尚未制作。
- 没有人脸出镜；卖点靠真实操作、字幕和配音承接。
- 未展示 AI 助手生成积木、插件创建和硬件真机；这些留给 B 站长版。
- 抖音/视频号上传时建议直接使用成片；如需平台内字幕，可再上传 `captions.srt`。
