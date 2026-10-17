# Visual Python Turtle 绘图插件设计

## 目标

提供一个可通过 Visual Python 插件管理器安装的 Turtle 教学插件。插件面向编程初学者，使用中文积木生成完整、可独立运行的 Python 标准库 `turtle` 程序，并允许 AI 在纯图形化、图形化与代码、纯代码三种模式中识别和操作 Turtle 内容。

## 交付物

- 源码目录：`examples/plugins/turtle/`
- 安装包：`artifacts/visual-python-turtle-plugin-1.0.0.zip`
- ZIP 根目录包含 `plugin.json`、`index.js` 和 `README.md`
- 插件 ID：`visual-python.turtle`
- 插件 API：`1`
- 不修改 Visual Python 宿主代码，不依赖第三方 Python 包

## 程序结构

“海龟程序”入口积木生成完整文件：

```python
import turtle

def main():
    screen = turtle.Screen()
    pen = turtle.Turtle()
    # 用户积木生成的代码
    screen.mainloop()

if __name__ == "__main__":
    main()
```

入口积木负责窗口、默认海龟和事件循环的生命周期。命令积木只生成 `pen` 或 `screen` 操作，不重复导入或初始化。事件处理函数定义在 `main()` 内，并使用积木 ID 生成稳定且互不冲突的函数名。

## 工具箱设计

插件贡献一个“海龟绘图”分类，按以下顺序排列：

1. 程序：海龟程序入口。
2. 移动：前进、后退、左转、右转、移动到、设置横坐标、设置纵坐标、回到原点、朝向指定角度。
3. 画笔：落笔、抬笔、设置线宽、设置速度、设置海龟形状、清空轨迹、复位、显示海龟、隐藏海龟。
4. 颜色与填充：设置画笔颜色、设置填充颜色、同时设置画笔与填充颜色、开始填充、结束填充。
5. 绘制：圆、圆点、正多边形、写文字、盖章、撤销上一步。
6. 画布：设置标题、背景颜色、窗口大小。
7. 事件：按键按下、画布点击、海龟点击。
8. 状态值：当前位置横坐标、纵坐标、当前方向、画笔是否落下。

数值、文本、布尔值和颜色通过可连接的值输入提供默认阴影块，减少手工输入。颜色使用 Blockly 标准颜色值积木，生成 Python 十六进制颜色字符串。

## 代码生成约束

- 所有块类型以 `visual_python_turtle_` 开头。
- 所有插件贡献 ID 以 `visual-python.turtle.` 开头。
- 语句积木保持标准上下连接；值积木声明正确输出类型。
- 入口积木具有语句输入但没有上下连接，防止出现多个不完整入口。
- 空入口生成 `pass`，保证 Python 语法有效。
- 正多边形将边数限制为至少 3，避免除零和无效图形。
- 速度遵循 Turtle 的 `0..10` 范围。
- 事件名称和按键值经过字符串序列化，不拼接未经转义的 Python 文本。

## AI 接入

manifest 声明：

- 能力说明：创建和修改 Python Turtle 教学绘图、动画与交互程序。
- 文件类型：`.py`。
- 检测方式：`imports`。

插件注册只读工具 `inspect_turtle_capabilities`，返回入口规则、可用能力、变量约定和事件限制。AI 的实际画布修改继续使用宿主通用工具：

- `get_block_templates`
- `compose_workspace`
- `search_blocks`
- `append_workspace_blocks` / `apply_workspace`

纯代码模式继续使用通用文档与定点代码编辑工具。插件不增加宿主专属执行器；Turtle 程序通过现有 Python 运行工具启动，运行前沿用宿主统一确认。

## 错误处理

- 插件激活失败由插件注册表显示，不静默降级。
- 不在 Turtle 入口中的命令仍生成明确的 `pen`/`screen` 调用，Python 检查会暴露未定义变量，促使用户或 AI 补充入口积木。
- 插件工具只返回结构化能力信息，不直接修改工程。
- 外部插件不访问文件系统、网络或 Tauri 原生命令。

## 测试与验收

自动验证覆盖：

1. `plugin.json` 满足应用清单规则。
2. 入口文件默认导出 `activate(context)`。
3. 所有块和贡献 ID 遵循命名空间。
4. 工具箱包含完整教学积木集合且显示中文。
5. 代表性生成器产生有效的 Turtle Python 代码。
6. 空入口、颜色字符串、正多边形和事件函数生成正确。
7. AI capability 与 `inspect_turtle_capabilities` 正确注册。
8. ZIP 仅包含预期文件，根目录存在唯一 `plugin.json`。
9. 使用应用现有 Rust ZIP 安装测试路径验证安装包可解压、可发现。
10. 项目前端全量测试、构建、Rust 测试、格式检查和 `git diff --check` 通过。

手工验收场景：安装并启用插件，让 AI 创建“彩色五角星”“同心圆”“可用方向键控制的海龟”三个项目，检查积木连接、生成代码、运行窗口和停用插件后的能力移除行为。
