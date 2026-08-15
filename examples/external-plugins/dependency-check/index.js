const BLOCK_TYPE = "visual_python_dependency_check_print";

export default {
  activate(context) {
    context.registerBlock({
      type: BLOCK_TYPE,
      message0: "输出依赖检测消息",
      previousStatement: null,
      nextStatement: null,
      colour: "#397bc0",
      tooltip: "用于验证插件的 Python 依赖检测状态。",
    }, () => "print('插件依赖已就绪')\n");

    context.registerToolboxCategory({
      id: "visual-python.dependency-check.toolbox",
      name: "依赖检测",
      colour: "#397bc0",
      contents: [
        { kind: "block", type: BLOCK_TYPE },
      ],
    });
  },
};
