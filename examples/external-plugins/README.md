# Visual Python 外部插件示例

完整开发规范参见 [插件开发指南](../../docs/plugin-development/README.md)。

本目录提供以下示例：

| 示例 | 用途 |
| --- | --- |
| `demo-print/` | 注册一个中文语句积木和工具箱分类，适合作为新插件模板。 |
| `dependency-check/` | 演示在 Manifest 中声明 Python 包依赖。 |
| `numpy/`、`pandas/`、`matplotlib/` | 原先内置的数学插件，现已改为外部插件；入口由 `scripts/build-external-math-plugins.mjs` 从 `src/plugins/externalSources/` 生成。 |

## 数学插件（NumPy / Pandas / Matplotlib）

这三个插件随应用一起分发，但以外部插件的形式安装和加载，不再作为内置插件编译进主程序。首次启动时会自动安装并信任；之后也可以在“设置 -> 插件”中停用或删除，删除后不会再次自动安装。插件安装后，工具箱会出现同名分类，积木类型与旧版本保持一致，已有工程可以继续打开。

重新生成入口文件：

```powershell
node scripts/build-external-math-plugins.mjs
```

脚本会同步生成 `index.js`、`plugin.json` 并做一次入口级校验（manifest、积木命名空间、工具箱分类）。生成后重新打包 ZIP：

```powershell
Compress-Archive -Path .\examples\external-plugins\numpy\* `
  -DestinationPath .\examples\external-plugins\numpy.zip -Force
```


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
