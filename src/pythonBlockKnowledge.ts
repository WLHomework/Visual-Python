import type { BlockAgentMetadata } from "./blockSearch";

type PythonBlockKnowledge = Omit<BlockAgentMetadata, "keywords" | "capabilities"> & {
  keywords?: string[];
  capabilities?: string[];
};

const statement = (purpose: string, capabilities: string[], extra: Partial<PythonBlockKnowledge> = {}): PythonBlockKnowledge => ({
  purpose,
  outputType: "statement",
  statement: true,
  capabilities,
  intentTags: ["python"],
  ...extra,
});

const expression = (purpose: string, outputType: string, capabilities: string[], extra: Partial<PythonBlockKnowledge> = {}): PythonBlockKnowledge => ({
  purpose,
  outputType,
  statement: false,
  capabilities,
  intentTags: ["python", "expression"],
  ...extra,
});

const nativeKnowledge: Record<string, PythonBlockKnowledge> = {
  python_print: statement("将一个或多个值输出到控制台", ["input-output", "output", "python"], { keywords: ["打印", "输出", "print"] }),
  python_print_many: statement("按分隔符输出多个值", ["input-output", "output", "python"], { keywords: ["打印", "输出", "print"] }),
  python_input: expression("从控制台读取一段文本", "String", ["input-output", "input", "python"], { keywords: ["输入", "读取", "input"] }),
  python_input_assign: statement("读取输入并保存到变量", ["input-output", "input", "variable"], { keywords: ["输入", "变量"] }),
  python_input_typed_assign: statement("读取输入并转换为指定类型后保存", ["input-output", "input", "conversion", "variable"]),
  python_input_many_assign: statement("一次读取多个输入并分别保存", ["input-output", "input", "variable"]),

  variables_get: expression("读取一个变量当前保存的值", "value", ["variable", "read"], { keywords: ["变量", "读取"] }),
  python_assign_target: statement("把一个值赋给变量或可赋值目标", ["variable", "assignment", "write"], { keywords: ["变量", "赋值", "设置"] }),
  python_augmented_assign: statement("使用运算后更新变量", ["variable", "assignment", "arithmetic"], { keywords: ["变量", "累加", "更新"] }),

  controls_if: statement("根据条件选择执行一个或多个分支", ["condition", "branch", "control-flow"], { keywords: ["条件", "判断", "如果", "否则"] }),
  logic_compare: expression("比较两个值并返回真假结果", "Boolean", ["condition", "compare", "logic"], { keywords: ["比较", "等于", "大于", "小于"] }),
  logic_boolean: expression("提供一个真假值", "Boolean", ["logic", "boolean"], { keywords: ["真", "假", "真假"] }),
  python_membership: expression("判断一个值是否属于某个序列或集合", "Boolean", ["condition", "membership", "collection"], { keywords: ["包含", "属于", "in"] }),
  python_not: expression("对真假结果进行逻辑非运算", "Boolean", ["logic", "condition"], { keywords: ["不是", "非", "not"] }),
  logic_operation: expression("组合两个真假条件", "Boolean", ["logic", "condition"], { keywords: ["并且", "或者", "and", "or"] }),

  python_for_in: statement("遍历一个可迭代对象并执行循环体", ["loop", "iteration", "control-flow"], {
    keywords: ["循环", "遍历", "for"],
    inputTypes: { ITERABLE: "iterable", DO: "statement" },
    requires: ["iterable"],
    recommendedFor: ["遍历列表", "排序", "批量处理"],
    relatedBlocks: ["python_range", "variables_get", "python_assign_target"],
  }),
  python_for_enumerate: statement("遍历序列并同时取得索引和值", ["loop", "iteration", "index", "control-flow"], { keywords: ["循环", "索引", "枚举"] }),
  python_for_else: statement("遍历对象并在循环正常结束时执行 else 分支", ["loop", "condition", "control-flow"], { keywords: ["循环", "遍历", "否则"] }),
  python_while: statement("只要条件为真就重复执行循环体", ["loop", "condition", "control-flow"], { keywords: ["循环", "while", "重复"] }),
  python_while_else: statement("执行条件循环并处理正常结束分支", ["loop", "condition", "control-flow"], { keywords: ["循环", "while", "否则"] }),
  python_async_for: statement("异步遍历一个可迭代对象", ["loop", "iteration", "async"], { keywords: ["异步", "循环", "遍历"] }),
  controls_for: statement("按数字范围重复执行循环体", ["loop", "iteration", "control-flow"], { keywords: ["循环", "重复", "次数"] }),
  python_range: expression("生成一个整数范围供循环或索引使用", "Array", ["range", "iteration", "sequence"], { keywords: ["范围", "区间", "range"] }),

  python_list_collection: expression("创建一个列表并按顺序保存多个值", "Array", ["list", "collection", "sequence"], { keywords: ["列表", "序列", "数组"] }),
  python_tuple: expression("创建一个不可变元组", "PythonTuple", ["tuple", "collection", "sequence"], { keywords: ["元组", "序列"] }),
  python_set: expression("创建一个不重复的集合", "PythonSet", ["set", "collection"], { keywords: ["集合", "去重"] }),
  python_dict: expression("创建一个键值对字典", "PythonDict", ["dictionary", "collection"], { keywords: ["字典", "键值对"] }),
  python_dynamic_dict: expression("创建一个可动态设置键值的字典", "PythonDict", ["dictionary", "collection"], { keywords: ["字典", "键值对"] }),
  python_list_method: statement("调用列表的常用方法修改或处理列表", ["list", "collection", "modify"], { keywords: ["列表", "追加", "删除", "排序"] }),
  python_list_insert: statement("在列表指定索引插入一个值", ["list", "collection", "modify", "index"], { keywords: ["列表", "插入", "索引"] }),
  python_list_set: statement("修改列表指定索引位置的值", ["list", "collection", "modify", "index", "assignment"], { keywords: ["列表", "设置", "索引", "交换"] }),
  python_list_slice_set: statement("替换列表的一段切片", ["list", "collection", "modify", "slice"], { keywords: ["列表", "切片", "替换"] }),
  python_list_slice_delete: statement("删除列表的一段切片", ["list", "collection", "modify", "slice"], { keywords: ["列表", "切片", "删除"] }),
  python_list_copy: expression("复制列表并得到一个独立的新列表", "Array", ["list", "collection", "copy"], { keywords: ["列表", "复制"] }),
  python_list_index: expression("按索引读取序列中的一个值", "value", ["list", "sequence", "index", "read"], { keywords: ["列表", "索引", "读取"] }),
  python_slice: expression("读取序列的一段切片", "sequence", ["sequence", "slice", "read"], { keywords: ["切片", "序列"] }),
  python_length: expression("获取文本或集合中的项目数量", "Number", ["length", "sequence", "collection"], { keywords: ["长度", "数量", "len"] }),
  python_sequence_query: expression("统计序列中的值或查找值的索引", "Number", ["sequence", "index", "query"], { keywords: ["序列", "查找", "次数"] }),
  python_sequence_combine: expression("拼接序列或重复序列", "sequence", ["sequence", "combine"], { keywords: ["序列", "拼接", "重复"] }),
  python_list_comprehension: expression("根据循环和条件快速创建列表", "Array", ["list", "iteration", "condition", "comprehension"], { keywords: ["列表", "推导式", "循环"] }),
  python_set_comprehension: expression("根据循环和条件快速创建集合", "PythonSet", ["set", "iteration", "condition", "comprehension"], { keywords: ["集合", "推导式"] }),
  python_dict_comprehension: expression("根据循环和条件快速创建字典", "PythonDict", ["dictionary", "iteration", "condition", "comprehension"], { keywords: ["字典", "推导式"] }),
  python_set_operation: expression("计算两个集合的并集、交集或差集", "PythonSet", ["set", "collection", "operation"], { keywords: ["集合", "并集", "交集", "差集"] }),
  python_set_relation: expression("判断两个集合之间的包含关系", "Boolean", ["set", "relation", "condition"], { keywords: ["集合", "子集", "超集"] }),
  python_set_method: statement("调用集合方法添加或删除元素", ["set", "collection", "modify"], { keywords: ["集合", "添加", "删除"] }),
  python_set_copy: expression("复制集合并得到一个独立的新集合", "PythonSet", ["set", "collection", "copy"]),
  python_dict_get: expression("按键读取字典中的值", "value", ["dictionary", "collection", "key", "read"], { keywords: ["字典", "键", "读取"] }),
  python_dict_set: statement("新增或修改字典中的键值对", ["dictionary", "collection", "key", "modify", "assignment"], { keywords: ["字典", "键值对", "设置"] }),
  python_dict_remove: statement("删除字典中的键值对", ["dictionary", "collection", "key", "modify"], { keywords: ["字典", "删除"] }),
  python_dict_view: expression("取得字典的键、值或键值对视图", "sequence", ["dictionary", "collection", "read"], { keywords: ["字典", "键", "值", "items"] }),
  python_dict_fromkeys: expression("用一组键创建字典", "PythonDict", ["dictionary", "collection", "construction"], { keywords: ["字典", "键"] }),

  python_function_def: statement("定义一个可重复调用的 Python 函数", ["function", "definition", "abstraction"], { keywords: ["函数", "定义", "参数"] }),
  python_function_structured: statement("以结构化方式定义一个可重复调用的函数", ["function", "definition", "abstraction"], { keywords: ["函数", "定义"] }),
  python_return: statement("从函数返回一个值", ["function", "return"], { keywords: ["函数", "返回"] }),
  python_return_none: statement("结束函数并返回空值", ["function", "return"], { keywords: ["函数", "返回"] }),
  python_call_structured: expression("调用已经定义的函数", "value", ["function", "call"], { keywords: ["函数", "调用"] }),

  python_import: statement("导入一个 Python 模块", ["import", "module", "dependency"], { keywords: ["导入", "模块", "import"] }),
  python_import_as: statement("导入模块并设置别名", ["import", "module", "dependency"], { keywords: ["导入", "模块", "别名"] }),
  python_import_multiple: statement("一次导入多个 Python 模块", ["import", "module", "dependency"]),
  python_from_import: statement("从模块中导入指定名称", ["import", "module", "dependency"], { keywords: ["导入", "模块", "from"] }),
  python_convert: expression("把一个值转换为指定的数据类型", "value", ["conversion", "type"], { keywords: ["转换", "类型"] }),

  python_file_read_text: expression("读取整个文本文件并返回文本", "String", ["file", "read", "input-output"], { keywords: ["文件", "读取", "文本"] }),
  python_file_write_text: statement("把文本覆盖写入或追加到文件", ["file", "write", "input-output"], { keywords: ["文件", "写入", "保存"] }),
  python_open_file: expression("打开文件并返回文件对象", "File", ["file", "open", "resource"], { keywords: ["文件", "打开"] }),
  python_file_read: expression("从已打开的文件读取内容", "value", ["file", "read"], { keywords: ["文件", "读取"] }),
  python_file_write: statement("向已打开的文件写入内容", ["file", "write"], { keywords: ["文件", "写入"] }),
  python_file_exists: expression("判断文件是否存在", "Boolean", ["file", "path", "condition"], { keywords: ["文件", "存在", "路径"] }),
  python_directory_exists: expression("判断目录是否存在", "Boolean", ["directory", "path", "condition"], { keywords: ["目录", "存在", "路径"] }),
  python_path_info: expression("读取文件或目录的路径信息", "value", ["file", "directory", "path"], { keywords: ["路径", "文件", "目录"] }),
  python_csv_read: statement("读取 CSV 表格文件并保存为数据", ["file", "csv", "data", "input-output"], { keywords: ["CSV", "表格", "文件", "读取"] }),
  python_csv_write: statement("把数据写入 CSV 表格文件", ["file", "csv", "data", "input-output"], { keywords: ["CSV", "表格", "文件", "写入"] }),
  python_sleep: statement("让程序暂停指定的秒数", ["time", "control-flow"], { keywords: ["等待", "暂停", "秒"] }),

  python_builtin_sorted: expression("返回排序后的新序列", "Array", ["sort", "sequence", "list"], { keywords: ["排序", "列表", "sorted"], recommendedFor: ["排序", "查找有序数据"] }),
  python_builtin_enumerate: expression("为可迭代对象提供索引和值", "sequence", ["iteration", "index"], { keywords: ["枚举", "索引", "遍历"] }),
  python_builtin_sum: expression("计算可迭代对象的总和", "Number", ["aggregation", "number", "sequence"], { keywords: ["求和", "总和"] }),
  python_builtin_min_max: expression("取得序列中的最小值或最大值", "value", ["aggregation", "compare", "sequence"], { keywords: ["最大值", "最小值"] }),
  python_builtin_zip: expression("把多个序列按位置配对", "sequence", ["sequence", "combine", "iteration"], { keywords: ["配对", "zip"] }),
  python_builtin_any_all: expression("判断序列中任一项或全部项是否为真", "Boolean", ["condition", "aggregation", "sequence"], { keywords: ["任一", "全部", "真假"] }),
  python_builtin_map_filter: expression("映射或筛选一个可迭代对象", "sequence", ["iteration", "sequence", "transform"], { keywords: ["映射", "筛选"] }),
  python_builtin_reversed: expression("返回反向遍历视图", "sequence", ["sequence", "iteration"], { keywords: ["反向", "遍历"] }),
  python_builtin_iter: expression("从可迭代对象创建迭代器", "iterator", ["iteration", "iterator"], { keywords: ["迭代器"] }),
  python_builtin_next: expression("取得迭代器的下一项", "value", ["iteration", "iterator"], { keywords: ["下一项", "迭代器"] }),
  python_builtin_abs: expression("取得一个数的绝对值", "Number", ["number", "math"], { keywords: ["绝对值"] }),
  python_builtin_pow: expression("计算幂运算结果", "Number", ["number", "math", "arithmetic"], { keywords: ["幂", "指数"] }),
  python_builtin_divmod: expression("同时计算商和余数", "sequence", ["number", "math", "arithmetic"], { keywords: ["商", "余数"] }),
  python_builtin_type: expression("取得一个值的类型", "type", ["type", "introspection"], { keywords: ["类型"] }),
  python_builtin_isinstance: expression("判断对象是否属于指定类型", "Boolean", ["type", "condition"], { keywords: ["类型", "判断"] }),
};

const addTypeFamilies = (type: string): PythonBlockKnowledge | undefined => {
  if (/^math_/.test(type)) return expression("生成或计算一个数学值", "Number", ["math", "number", "arithmetic"], { keywords: ["数学", "数字", "运算"] });
  if (/^text_/.test(type) || /string/.test(type)) return expression("创建或处理文本", "String", ["string", "text"], { keywords: ["文本", "字符串"] });
  if (/^lists_/.test(type)) return expression("创建或处理列表", "Array", ["list", "collection", "sequence"], { keywords: ["列表", "序列"] });
  if (/^variables_/.test(type)) return expression("读取或管理变量", "value", ["variable"], { keywords: ["变量"] });
  return undefined;
};

export function getPythonBlockAgentMetadata(type: string): BlockAgentMetadata | undefined {
  const metadata = nativeKnowledge[type] || addTypeFamilies(type);
  return metadata ? { ...metadata, keywords: [...(metadata.keywords || [])], capabilities: [...(metadata.capabilities || [])] } : undefined;
}

export function mergeBlockAgentMetadata(...sources: Array<BlockAgentMetadata | undefined>): BlockAgentMetadata | undefined {
  const present = sources.filter((source): source is BlockAgentMetadata => Boolean(source));
  if (!present.length) return undefined;
  const merged: BlockAgentMetadata = {};
  for (const source of present) {
    for (const key of ["description", "purpose", "outputType", "statement"] as const) {
      if (source[key] !== undefined) Object.assign(merged, { [key]: source[key] });
    }
    for (const key of ["aliases", "keywords", "examples", "capabilities", "dependencies", "requires", "relatedBlocks", "recommendedFor", "avoidFor", "intentTags"] as const) {
      const values = source[key];
      if (values?.length) merged[key] = [...new Set([...(merged[key] || []), ...values])];
    }
    if (source.inputDescriptions) merged.inputDescriptions = { ...(merged.inputDescriptions || {}), ...source.inputDescriptions };
    if (source.inputTypes) merged.inputTypes = { ...(merged.inputTypes || {}), ...source.inputTypes };
  }
  return merged;
}
