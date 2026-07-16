# External plugin examples

This folder contains example plugins for Visual Python.

## Install the demo plugin on Windows

Copy this folder:

```text
examples\external-plugins\demo-print
```

to the app plugin folder:

```text
%APPDATA%\com.visualpython.desktop\plugins\demo-print
```

Then open Visual Python, click the plugin button in the left rail, and click "扫描外部插件".

The "Demo Print" card should appear as an external plugin. Enable it, confirm trust, and a new toolbox category named "外部示例" should appear.

## Manifest shape

```json
{
  "id": "visual-python.demo",
  "name": "Demo Print",
  "version": "1.0.0",
  "apiVersion": "1",
  "entry": "index.js",
  "description": "Adds a simple external plugin print block."
}
```

The `entry` file must export an object with an `activate(context)` function.
