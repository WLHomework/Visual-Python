export default {
  activate(context) {
    context.registerBlock({
      type: "visual_python_dependency_check_print",
      message0: "打印依赖检测测试消息",
      previousStatement: null,
      nextStatement: null,
      colour: "#397bc0",
      tooltip: "测试插件依赖检测状态",
      helpUrl: ""
    }, () => "print(\"Dependency check plugin is active\")\n");

    context.registerToolboxCategory({
      id: "visual-python.dependency-check.toolbox",
      name: "依赖测试",
      colour: "#397bc0",
      contents: [
        { kind: "block", type: "visual_python_dependency_check_print" }
      ]
    });
  }
};
