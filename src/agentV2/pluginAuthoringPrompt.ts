// 插件开发提示词在两处 Agent 路径共享：chat-completions（agentCore）与 Codex/Responses（codexAgent）。
// 提示词只描述工作流程；插件 API 细节由 inspect_plugin_api 返回的契约提供。
export const pluginAuthoringRules = `

插件开发规则：
- 新插件：先调用 inspect_plugin_api 读取契约和 IR 规格，再用 create_plugin_plan 规划（blocks 用 IR 规格给出类型、输入、字段和 generator 模板），把返回的 planId 传给 create_plugin_draft 编译出 plugin.json、codegen.json、index.js。扩展已启用插件前先调用该能力的只读检查工具，取得真实入口积木、输入名、运行对象和代码生成约定；没有可验证的能力契约时必须创建自包含插件。积木类型、输入名、激活方式和生成的 Python 一律以工具返回的插件契约为准，不要猜测宿主输入名或入口。不要把插件代码写入当前普通 Python 文档。
- IR 草稿（create_plugin_draft 生成的）只能用 apply_plugin_plan 修改：先 read_plugin_draft 查看积木 ref、模板和工具箱，再用 add_block/update_block/delete_block/set_manifest/set_toolbox 等操作提交最小改动；失败时按 issues 中的 operationIndex、ref、字段定位修改对应操作后重新提交，不要整包重做，也不要用文件工具修改生成文件。
- 草稿和计划只以工具返回的 ID 为准：不要复用历史消息中的 draftId/planId，不要猜测或拼接 ID。工具报“插件草稿不存在”或“插件计划不存在”时，不要连续重试其它 ID：用 create_plugin_draft（必要时先重新 create_plugin_plan）重建，或对已安装插件调用 import_installed_plugin_draft 恢复为草稿。
- 需要宿主 API 细节时用 read_plugin_guide 阅读官方《插件开发指南》：先按契约 guide.sections 选小节（省略 section 返回目录），长小节用 nextOffset 继续；不要凭记忆编造宿主 API。
- 生成器模板占位符：{INPUT:名} 取值输入的子表达式，{STMTS:名} 取语句体（放在行首第 0 列；空体自动补 pass），{FIELD:名} 取字段值；generator.imports/init 声明 Python 行，并在模板里用 {IMPORTS}/{INIT} 标记插入位置。所有积木生成的 Python 必须形成完整、可解释的程序结构，不得引用未导入、未初始化或未由扩展契约声明的运行对象；不得凭空创造变量名、入口名或宿主 API。生成代码统一使用 4 个空格缩进，禁止 Tab；嵌套语句交给 {STMTS} 占位符处理，不要手工拼接缩进。
- 模板表达不了的入口注册逻辑（额外的 registerSetting/registerCommand、入口模块顶层辅助代码）用 apply_plugin_plan 的 add_hook：slot 为 module 时注入入口模块顶层，slot 为 activate 时注入 activate(context) 内部。
- 修改已安装插件：先用 list_installed_plugins 找到准确 ID，再用 import_installed_plugin_draft 导入；带 .ai-ir.json 的插件会自动恢复 IR 模式，其余按原始文件编辑。files 模式下先用 read_plugin_draft_file 分页读取真实源码，再优先使用 edit_plugin_draft_file 定点替换，oldText 必须唯一匹配；只有确实需要整体重建多个文件时才使用 update_plugin_draft。
- 每个草稿必须维护 codegen.json：standalone 模式必须自行生成所需 import、初始化和结束逻辑；extension 模式必须声明 provider 和 runtimeNames，并严格使用提供方公开的入口与运行对象。IR 草稿的 codegen.json 由编译器生成，只需通过 IR 的 manifest 与 agent 元数据表达。
- codegen.json 只是代码生成契约，不会被宿主自动转换成积木。IR 编译产物会在 activate(context) 中注册全部积木和工具箱；若手写入口，必须实际注册积木、工具箱、设置、命令、文档处理器或 Agent 工具后才算激活成功。
- 先创建或更新同一个插件草稿，再调用 validate_plugin_draft 验证；验证失败时根据 issues 修改草稿后重新验证，不要重复创建相同插件。静态验证通过后调用 run_plugin_draft_checks，只有运行检查返回 phase ready 才准备安装；该检查会在宿主中执行插件 JavaScript，宿主会请求用户确认，被拒绝时不要重复调用。
- 插件安装、加载或运行失败后，在再次修改草稿前调用 get_diagnostics，结合工具错误、输出和问题定位原因；不要在未读取诊断时猜测修改。
- install_plugin_draft 会写入本地插件目录并执行插件 JavaScript，宿主会提供唯一的安装确认；插件草稿验证通过后，向用户说明已准备安装并等待确认，只有用户明确确认安装后才调用，不要用 ask_user 重复确认，未确认时不要安装。
`;
