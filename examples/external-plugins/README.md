# Visual Python 外部插件示例

完整开发规范参见 [插件开发指南](../../docs/plugin-development/README.md)。

本目录提供两个最小示例：

| 示例 | 用途 |
| --- | --- |
| `demo-print/` | 注册一个中文语句积木和工具箱分类，适合作为新插件模板。 |
| `dependency-check/` | 演示在 Manifest 中声明 Python 包依赖。 |

## 本地目录安装

开发时可以把插件目录复制到：

```text
%APPDATA%\com.visualpython.desktop\plugins\<插件 ID>
```

重新打开 Visual Python，在“设置 -> 插件”中启用插件并确认信任。

## ZIP 安装

以 `demo-print` 为例，在项目根目录执行：

```powershell
Compress-Archive -Path .\examples\external-plugins\demo-print\* `
  -DestinationPath .\examples\external-plugins\demo-print.zip `
  -Force
```

随后在“设置 -> 插件 -> 安装插件”中选择生成的 ZIP。

## 开发注意事项

- API v1 的入口必须是自包含的 `.js` 或 `.mjs` 文件。
- 外部插件入口不能依赖相对 JavaScript 模块导入。
- 积木类型和插件贡献 ID 必须使用插件自己的命名空间。
- 启用外部插件会执行本地 JavaScript，只安装和启用可信源码。
