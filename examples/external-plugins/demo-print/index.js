export default {
  activate(context) {
    context.registerBlock({
      type: "visual_python_demo_print",
      message0: "打印外部插件消息",
      previousStatement: null,
      nextStatement: null,
      colour: "#3d8f7a",
      tooltip: "由外部插件提供的测试积木",
      helpUrl: ""
    }, () => "print(\"Hello from external plugin\")\n");

    context.registerToolboxCategory({
      id: "visual-python.demo.toolbox",
      name: "外部示例",
      colour: "#3d8f7a",
      contents: [
        { kind: "block", type: "visual_python_demo_print" }
      ]
    });
  }
};
