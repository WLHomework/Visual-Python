# 图形化 Agent 改造基线

记录日期：2026-10-14

## 当前状态

- 修改前聚焦回归：`npx vitest run src/agentV2/blocklyHost.test.ts src/agentV2.test.ts`
- 结果：2 个测试文件、80 个测试全部通过。
- 当前模型可见的 Blockly 工具：`get_workspace`、`get_task_block_directory`、`search_blocks`、`get_block_templates`、`compose_workspace`、`import_python_workspace`。
- 当前执行器还接受 `append_workspace_blocks`、`replace_workspace`、`add_workspace_block`、`apply_workspace`；兼容工具与常规工具分别导出。
- `compose_workspace` 会批量读取模板，在临时 Blockly 工作区创建并连接积木，运行上下文和 Python 校验后提交一次。
- 现有针对 `compose_workspace` 的测试覆盖批量模板读取、显式值连接、语句串接、追加到已有语句槽、非法引用/校验失败不提交；旧接口测试仍在迁移中。

## 迁移回归矩阵

| 场景 | 必须保持的行为 | 目标验证 |
| --- | --- | --- |
| Python 输出语句 | 按真实字段和输入槽生成并连接输出块 | 新计划一次提交、代码与工作区一致 |
| 嵌套动画结构 | 值积木使用真实连接检查器连接到动画输入 | 不兼容连接失败且不提交 |
| Turtle 语句链 | 语句块按计划顺序连接 | 连接顺序与生成代码一致 |
| 已有工作区局部编辑 | patch 只更改目标字段/连接/积木 | 未涉及的积木保持不变 |
| 不存在的字段或输入 | 返回操作序号和字段/输入名 | 原工作区与 commit 次数不变 |
| Python 生成校验失败 | 返回验证错误，不应用候选状态 | commit 调用次数为 0 |

## 旧基线工具调用特征

- 现有测试验证 `compose_workspace` 的模板读取是单次批量调用。
- 多个旧写入工具仍可由执行器独立调用，因此模型选择路径并非唯一。
- 尚无真实模型端到端 Token/延迟基准；后续必须使用固定任务和模拟/记录的请求数据，不用未经测量的 Token 改善比例作为验收结论。
