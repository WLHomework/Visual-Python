# MicroPython 兼容性审计

> 审计范围：Visual Python 当前内置 Python 工具箱，目标固件为项目固件目录标注的 MicroPython v1.29.0，板卡为 ESP32 WROOM 与 ESP8266 ESP-12E。判断以生成代码和 MicroPython 官方文档为准；未连接真实设备的项目不能视为已验证。

## 审计结论

| 工具箱分类 / 积木组 | 生成代码 | MicroPython 状态 | 处理建议 | 依据 |
| --- | --- | --- | --- | --- |
| 输入输出中的 `python_print*`、长度/类型转换 | `print`、`len`、`int` 等内置调用 | 可用 | 保留 | [MicroPython language reference](https://docs.micropython.org/en/latest/genindex.html) |
| 输入输出中的 `python_input*` | `input()` | 设备通常无交互式标准输入 | 隐藏 | [MicroPython differences](https://docs.micropython.org/en/latest/genindex.html)；硬件运行器不提供 stdin |
| 基础赋值、逻辑、循环、数学运算、文本、集合、内置函数 | Python 语法和内置类型操作 | 语法/内置类型大多可用 | 保留 | [MicroPython language reference](https://docs.micropython.org/en/latest/genindex.html) |
| 文件分类全部 | `open`、`pathlib`、`os` 文件与目录操作 | `pathlib`、完整 PC 文件 API 不在固件运行时；设备文件应使用硬件文件 API | 隐藏 | `src/pythonBlocks.ts`、`src/pythonSyntaxBlocks.ts`；[MicroPython library](https://docs.micropython.org/en/latest/library/index.html) |
| 模块分类的通用导入块 | 任意 `import` / `from ... import ...` | 可导入任意用户文件，但模块是否存在无法由工具箱保证 | 隐藏 | `src/pythonSyntaxBlocks.ts` 生成器 |
| 标准库：`math`、`random`、`json`、`time`、`re` | 对应模块调用 | 固件提供子集，具体成员受版本/端口限制 | 保留并在真实硬件验收覆盖 | [MicroPython library](https://docs.micropython.org/en/latest/library/index.html) |
| 标准库：`collections` 及 `random.sample` / `random.shuffle` | 对应模块调用 | 目标固件没有项目当前生成器依赖的稳定成员集合 | 隐藏 | [MicroPython library](https://docs.micropython.org/en/latest/library/index.html) |
| 标准库：`pprint`、`csv`、`datetime`、`pathlib`、`sys.argv`、`os.getenv` | PC 标准库调用 | 不属于目标固件的稳定公共子集 | 隐藏 | [MicroPython library](https://docs.micropython.org/en/latest/library/index.html) |
| 现代语法 `match/case` | Python 3.10 模式匹配 | 目标固件语法支持需按端口确认，不能假设可用 | 隐藏 | `src/pythonSyntaxBlocks.ts`；[MicroPython differences](https://docs.micropython.org/en/latest/genindex.html) |
| 异步分类 | `asyncio`、异步函数与 `await` | MicroPython 使用 `uasyncio`，当前生成代码未导入/适配 | 隐藏 | `src/pythonSyntaxBlocks.ts`；[uasyncio](https://docs.micropython.org/en/latest/library/asyncio.html) |

## 实施边界

硬件界面使用 `src/hardware/toolboxes/` 的**白名单**，不再使用隐藏名单：每块板卡一份声明，列出工具箱里的分类与积木；通用分类里没有列进声明的积木不会出现在硬件界面。Python Profile 不受影响。已保存工作区中的历史积木仍按原定义加载，生成前需结合现有代码/硬件校验处理；设备文件操作继续走“设备”面板的专用 API。数学、随机、JSON、时间和正则模块只做工具箱级保留，必须在 P7 的 ESP32/ESP8266 真机清单中逐项验证成员差异。

## 参考代码

- 工具箱组装：`src/pythonBlocks.ts`、`src/pythonSyntaxBlocks.ts`
- Profile 过滤入口：`src/profiles/profileToolbox.ts`
- 硬件积木与板卡校验：`src/hardware/blocks/`、`src/hardware/boardProfiles.ts`
