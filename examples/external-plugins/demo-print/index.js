const BLOCK_TYPE = "visual_python_demo_print";

export default {
  activate(context) {
    context.registerBlock({
      type: BLOCK_TYPE,
      message0: "输出消息 %1",
      args0: [
        { type: "input_value", name: "TEXT", check: "String" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#3d8f7a",
      tooltip: "在 Python 控制台输出一段文字。",
    }, (block, generator) => {
      const text = generator.valueToCode(block, "TEXT", 0) || "'你好，Visual Python'";
      return `print(${text})\n`;
    });

    context.registerToolboxCategory({
      id: "visual-python.demo.toolbox",
      name: "输出示例",
      colour: "#3d8f7a",
      contents: [
        {
          kind: "block",
          type: BLOCK_TYPE,
          inputs: {
            TEXT: {
              shadow: {
                type: "text",
                fields: { TEXT: "你好，Visual Python" },
              },
            },
          },
        },
      ],
    });
  },
};
