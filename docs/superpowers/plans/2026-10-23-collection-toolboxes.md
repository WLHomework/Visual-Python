# 元组 / 字典 / 集合工具箱实施计划

> **状态**：T1～T8 已完成（2026-10-23）。ESP8266 真机 11/11 通过；S3 / WROOM 无硬件，明确未验证。
> **日期**：2026-10-23
> **进展**：T1 工具箱解析器已支持 `fromCategory`；T2 已把 Python 工具箱拆成列表 / 元组 / 字典 / 集合四个分类，并让四个分类的积木与分类色一致；T3 已加入 P0 新积木与两个增强；T4 已补齐容器类型推断与中文告警；T5 已给 S3 / WROOM / 8266 加入四个容器分类；T6 已加入 `python_dict_item` 和 `python_tuple_unpack`；T7 已写 `collections_smoke.py` 并更新硬件文档；T8 已在 ESP8266 上跑通 11/11，并发现/修复元组带步长切片不兼容问题；`npm test` 为 119 个测试文件 / 1240 个测试全部通过。
> **范围**：普通 Python 工作台，以及 ESP32-S3、ESP32-WROOM、ESP8266-ESP12E 三套硬件工具箱。  
> **用户决定**：按「列表 / 元组 / 字典 / 集合」四个一级分类拆分；三块硬件板卡也一起加。  
> **基线**：`npx tsc --noEmit` 通过；`npm test` 为 119 个测试文件 / 1227 个测试全部通过；`npm run build` 通过；Rust 硬件测试 72 项通过。  
> **取代关系**：本计划只解除 `2026-10-19-board-toolboxes.md` 中 D2 对「字典 / 集合」的限制；`try/except`、`None`、`pass`、`sum/min/max/sorted` 等仍不加入硬件工具箱。  
> **注意**：本文是实施计划，不是真机验收结果。MicroPython 的 API 与固件能力必须按 v1.29.0 文档和实际设备核对。

---

## 0. 实施规则

1. **按任务顺序做**（T1 → T8）。T1 是 T2 的前置条件，不能先拆分类再补解析器。
2. **不改已有积木类型名和序列化格式**。旧工程里的 `python_tuple`、`python_set`、`python_dict`、`python_dynamic_dict` 必须继续能加载。
3. **不新增重复的“每种类型一套索引/切片/长度/包含/循环”积木**。通用操作优先复用现有积木，通过工具箱预配置露出。
4. **每个任务完成前至少通过**：
   ```bash
   npx tsc --noEmit
   npx vitest run <相关测试文件>
   ```
   涉及工具箱结构、生成器或构建产物的任务，最后统一跑：
   ```bash
   npm test
   npm run build
   ```
5. **不改 Rust、不改固件烧写逻辑、不改设备会话协议**。本计划只涉及前端积木、工具箱、类型检查和文档。
6. **硬件分类必须走白名单**：只改 `src/hardware/toolboxes/` 下的声明，不在 `App.tsx` 里按板卡 ID 判断。
7. **MicroPython 事实必须核对**：`set` 是否启用、`dict` 方法是否存在、是否支持 `dict |`、`popitem`、`setdefault`、`sorted(key=...)`，都要以固件实测为准。标注“待真机”的功能不能直接下放到 WROOM/8266。
8. **无法操作真机时不许写“已通过”**。真机结果单独记录，S3/WROOM 没有硬件时明确写“未验证”。
9. **不要自动提交**。用户未明确要求时，只改工作区并汇报，不执行 `git commit`。

---

## 1. 目标与现状

### 1.1 现状

- Python 工具箱目前只有一个「集合」分类，里面同时放着列表、元组、集合、字典的创建、方法、运算和推导式。
- 元组没有独立分类；字典和集合的很多能力已经实现，但工具箱没有露出来。
- 三块硬件板卡的工具箱目前只有「列表」分类，没有元组、字典、集合分类。
- 现有硬件测试中有一条明确断言：搜索「字典」应为空。这条断言要随本计划一起改。
- 现有集合相关积木已经覆盖：
  - 创建：`python_sequence_collection`（list/tuple/set）、`python_dynamic_dict`；
  - 读取：`python_index`、`python_slice`、`python_length`、`python_membership`、`python_sequence_query`；
  - 列表：`python_list_method`、`python_list_insert`、`python_list_set`、`python_list_slice_set`、`python_list_slice_delete`、`python_list_copy`；
  - 集合：`python_set_operation`、`python_set_relation`、`python_set_method`、`python_set_copy`；
  - 字典：`python_dict_get`、`python_dict_set`、`python_dict_remove`、`python_dict_view`、`python_dict_method`、`python_dict_query`、`python_dict_fromkeys`；
  - 推导式：`python_list_comprehension`、`python_set_comprehension`、`python_dict_comprehension`。

### 1.2 目标

1. Python 工具箱出现四个一级分类：**列表、元组、字典、集合**。
2. 三块硬件板卡也出现这四个分类；每块板卡只放 MicroPython 已确认支持的积木。
3. 补齐高价值缺口：
   - 字典视图转列表；
   - 同时遍历字典的键和值；
   - 合并两个字典为新字典；
   - 用键列表和值列表创建字典；
   - 删除字典键时选择“不存在时忽略/报错”；
   - 集合的原地交集、差集、对称差集；
   - 元组解包；
   - 集合去重创建（可用现有转换积木预配置）。
4. 扩展类型推断和中文告警，避免把集合当列表索引、把元组当可变序列修改、把列表当字典键。
5. 保持旧工程兼容，不要求用户重建积木。

### 1.3 非目标

- 不重写所有集合积木的代码生成。
- 不新增 `frozenset`、命名元组实例化、嵌套字典路径读取等 P2 能力；它们只在第 3 节列为 backlog。
- 不把 `dict |`、`sorted`、`popitem`、`setdefault` 等未在硬件上验证的 API 放进硬件工具箱。
- 不改变硬件工具箱的白名单机制。
- 不修改 `App.tsx` 的界面结构。

---

## 2. 目标工具箱结构

### 2.1 Python 工作台

四个分类保持同一紫色系（积木颜色仍用 `#7657b5`），分类内部用小节标题分组：

```text
列表
  创建 / 修改 / 查询 / 遍历 / 推导式
元组
  创建 / 读取 / 组合 / 解包 / 遍历
字典
  创建 / 读取 / 修改 / 遍历 / 推导式
集合
  创建 / 查询 / 运算 / 修改 / 遍历 / 推导式
```

说明：

- 现有「集合」分类改名为「列表」，只放列表专属积木和预配置的通用积木。
- 新增「元组」「字典」「集合」三个分类，放在「列表」之后。
- 「标准库 > 集合工具」继续保留 `Counter`、`defaultdict`、`deque`、`namedtuple`，与数学集合分类不是一回事。建议把该小节标题改成「collections 容器」，避免和新的「集合」分类混淆。
- 四个分类使用不同色条，并且分类内的积木使用同一个颜色：列表 `#7657b5`、元组 `#2e8b57`、字典 `#b8860b`、集合 `#c04a6a`。通用积木（索引、切片、长度、包含、遍历等）通过工具箱条目的 `extraState.palette` 换色，不复制积木类型；`python_sequence_collection` 则跟随 `KIND` 自动换色。
- 这些颜色要避开硬件现有分类色（见 `hardwareColours`），后续给三块板卡加分类时直接复用 `baseCategoryColour("元组")` 等，不要另写一套。

### 2.2 硬件工作台

三块板卡的分类顺序建议：

```text
列表 → 元组 → 字典 → 集合 → 赋值 → 变量 → 函数 → 调用 → 串口 → ...
```

每块板卡只放第 6.5 节表格中“确认支持”的积木。硬件工具箱是白名单，新增分类必须同步更新：

- `src/hardware/toolboxes/common.ts`
- `src/hardware/toolboxes/esp32-s3.ts`
- `src/hardware/toolboxes/esp32-wroom.ts`
- `src/hardware/toolboxes/esp8266-esp12e.ts`
- 对应测试文件

### 2.3 插件分类（本次附带修复）

Matplotlib、Pandas、NumPy 的插件工具箱是「根分类 → 子分类」结构。子分类的色条统一使用插件主色（分别为 `#c45a4a`、`#4c8b6b`、`#3d7fb5`），与插件积木颜色一致；不再为每个子分类单独指定颜色。

---

## 3. 详细积木清单

状态说明：

- **已有**：积木类型和生成器已经存在，只改工具箱位置或预配置。
- **预配置**：复用已有积木，只在工具箱条目里换默认影子/字段。
- **新增**：需要新增 Blockly 类型和生成器。
- **增强**：在已有积木上增加字段或选项，保持旧字段默认值兼容。

### 3.1 列表

列表本身已经比较完整，本次只做分类迁移和入口整理，不新增列表专属类型。

| 分区 | 积木 | 状态 | 说明 |
| --- | --- | --- | --- |
| 创建 | 列表 `[项目…]`，0～N 项 | 已有 | `python_sequence_collection`，`KIND=list` |
| 创建 | 列表推导式 | 已有 | `python_list_comprehension` |
| 修改 | 末尾添加、合并、移除、按位置弹出、排序、反转、清空 | 已有 | `python_list_method` |
| 修改 | 指定位置插入 | 已有 | `python_list_insert` |
| 修改 | 指定索引赋值 | 已有 | `python_list_set` |
| 修改 | 切片替换、切片删除 | 已有 | `python_list_slice_set` / `python_list_slice_delete` |
| 查询 | 索引、切片、长度、包含 | 已有 | `python_index` / `python_slice` / `python_length` / `python_membership` |
| 查询 | 出现次数、查找位置 | 已有 | `python_sequence_query` |
| 查询 | 复制 | 已有 | `python_list_copy` |
| 组合 | 拼接、重复 | 已有 | `python_sequence_combine` |
| 遍历 | 每项、序号+项 | 已有 | `python_for_in` / `python_for_enumerate` |

### 3.2 元组

| 分区 | 积木 | 状态 | 实现/生成 |
| --- | --- | --- | --- |
| 创建 | 元组 `(项目…)`，0～N 项 | 预配置 | `python_sequence_collection`，`KIND=tuple`；单元素自动 `(x,)`，空元组 `()` |
| 创建 | 列表/字符串转元组 | 预配置 | `python_convert`，`TYPE=tuple`，生成 `tuple(x)` |
| 创建 | 配对两个序列 `zip` | 预配置 | `python_builtin_zip`，每项是元组 |
| 创建 | 命名元组类型 | 已有 | `python_collections_namedtuple`；只创建类型，实例化放 P2 |
| 读取 | 第 N 项、负索引 | 预配置 | `python_index` |
| 读取 | 切片 | 预配置 | `python_slice` |
| 读取 | 长度 | 预配置 | `python_length` |
| 读取 | 是否包含某值 | 预配置 | `python_membership` |
| 读取 | 统计出现次数、查找位置 | 预配置 | `python_sequence_query` |
| 组合 | 拼接、重复 | 预配置 | `python_sequence_combine` |
| 解包 | 解包到多个变量、剩余项 | 新增/预配置 | P1 `python_tuple_unpack`；也可先用 `python_assign_target` + `python_unpack_many_target` |
| 遍历 | 每项、序号+项 | 预配置 | `python_for_in` / `python_for_enumerate` |

提示文案：

- 元组不可增删改；需要修改时先转成列表。
- 单元素元组必须带逗号：`(1,)`。
- 元组中所有元素都可哈希时，元组才能作字典键或集合元素。
- 元组本身可包含列表，但包含列表后就不再可哈希。

### 3.3 字典

| 分区 | 积木 | 状态 | 实现/生成 |
| --- | --- | --- | --- |
| 创建 | 字典 `{键: 值…}`，0～N 项 | 已有 | `python_dynamic_dict` |
| 创建 | 用键列表 + 初始值创建 | 已有 | `python_dict_fromkeys` |
| 创建 | 用键列表和值列表创建 | 新增 P0 | `python_dict_from_pairs`，生成 `dict(zip(keys, values))` |
| 创建 | 字典推导式 | 已有 | `python_dict_comprehension` |
| 创建 | 复制字典 | 已有 | `python_dict_query` 的 `copy` |
| 读取 | 安全读取 `get(键, 默认值)` | 已有 | `python_dict_get` |
| 读取 | 直接按键读取 `data[键]`，不存在时报错 | 新增 P1 | `python_dict_item`；也可预配置 `python_index`，但新块标签更准确 |
| 读取 | 判断键是否存在 | 预配置 | `python_membership`，标签写清“检查的是键” |
| 读取 | 判断值是否存在 | 预配置 | `python_membership` + `values()` |
| 读取 | 键/值/键值对视图 | 已有 | `python_dict_view` |
| 读取 | 键/值/键值对转列表 | 新增 P0 | `python_dict_view_list`，输出 `list(...)` |
| 读取 | 长度 | 预配置 | `python_length` |
| 修改 | 设置/新增键值 | 已有 | `python_dict_set` |
| 修改 | 删除键，不存在时忽略/报错 | 增强 P0 | `python_dict_remove` 增加 `MISSING` 下拉 |
| 修改 | 弹出键并返回、弹出最后一项、设置默认值 | 已有 | `python_dict_query` 的 `pop` / `popitem` / `setdefault` |
| 修改 | 合并另一个字典、清空 | 已有 | `python_dict_method` 的 `update` / `clear` |
| 修改 | 合并为新字典，不改原字典 | 新增 P0 | `python_dict_merge`，生成 `left \| right` |
| 修改 | 用键值对列表更新字典 | backlog | 可先不单独造块 |
| 遍历 | 同时遍历键和值 | 新增 P0 | `python_for_dict`，生成 `for 键, 值 in data.items():` |
| 遍历 | 只遍历键 | 预配置 | `python_for_in` 直接接字典 |
| 高级 | 按键/值排序条目 | 新增 P2 | `python_dict_sorted_items`，桌面版使用，硬件版不放 |
| 高级 | 反转键值 | 新增 P2 | `python_dict_invert`；重复值会丢失，需要提示 |

提示文案：

- 字典键必须可哈希；列表、字典、集合不能直接作键。
- 字典保持插入顺序，但不要把它当序列索引。
- `get` 找不到键时返回默认值；`data[键]` 找不到会抛 `KeyError`。
- `fromkeys` 使用列表/字典作为默认值时，所有键会共享同一个对象。
- `copy` 是浅拷贝。

### 3.4 集合

| 分区 | 积木 | 状态 | 实现/生成 |
| --- | --- | --- | --- |
| 创建 | 集合 `{项目…}`，0～N 项 | 预配置 | `python_sequence_collection`，`KIND=set` |
| 创建 | 空集合 | 预配置 | 同上，生成 `set()`，不能写成 `{}` |
| 创建 | 从列表/元组去重创建 | 预配置/新增 P1 | 优先 `python_convert`，`TYPE=set`；P1 可加 `python_set_from` |
| 创建 | 集合推导式 | 已有 | `python_set_comprehension` |
| 创建 | 复制集合 | 已有 | `python_set_copy` |
| 查询 | 是否包含某值 | 预配置 | `python_membership` |
| 查询 | 长度 | 预配置 | `python_length` |
| 查询 | 子集、真子集、超集、真超集、互不相交 | 已有 | `python_set_relation` |
| 查询 | 两个集合相等/不等 | 预配置 | `logic_compare` |
| 运算 | 并集、交集、差集、对称差集 | 已有 | `python_set_operation` |
| 修改 | 添加、合并、删除、丢弃、弹出、清空 | 已有 | `python_set_method` |
| 修改 | 原地交集、差集、对称差集 | 增强 P0 | `python_set_method` 增加 `intersection_update` 等选项 |
| 遍历 | 每项 | 预配置 | `python_for_in` |
| 注意 | 不能索引、不能切片 | 不放入 | 集合分类不放索引/切片；通用块加类型告警 |

提示文案：

- 集合无序，不能按位置取值。
- 集合元素必须可哈希；列表、字典、集合不能直接放进去。
- 重复元素会自动合并。
- 空集合是 `set()`，`{}` 是空字典。
- 集合本身不能作为另一个集合的元素；需要时用 `frozenset`（本计划不做）。

### 3.5 跨类型操作

这些积木不需要按类型各造一个，放在相应分类里预配置即可：

- `python_index`：列表、元组、字典按键读取（字典建议用 P1 专用块）。
- `python_slice`：列表、元组、字符串；集合分类不放。
- `python_length`：列表、元组、字典、集合、字符串。
- `python_membership`：列表、元组、字典、集合、字符串。
- `python_sequence_query`：列表、元组。
- `python_sequence_combine`：列表、元组。
- `python_convert`：`list` / `tuple` / `set` / `dict`。
- `python_for_in`：所有可迭代容器；字典直接遍历得到键。
- `python_for_enumerate`：列表、元组；字典需要先转条目列表。

---

## 4. 新增与增强积木设计

### 4.1 P0：`python_dict_view_list`

- **类型**：值积木。
- **文案**：`字典 %1 的 %2 列表`。
- **字段**：`VIEW` 下拉：键 `keys` / 值 `values` / 键值对 `items`。
- **输入**：`DICT`，检查 `PythonDict`。
- **输出**：`Array`。
- **生成**：
  - `list(数据.keys())`
  - `list(数据.values())`
  - `list(数据.items())`
- **用途**：视图不能直接用列表方法；转成列表后可以索引、排序、交给列表积木。
- **校验**：字典类型告警；空输入默认 `{}`。
- **工具箱**：字典 / 读取。

### 4.2 P0：`python_for_dict`

- **类型**：语句积木。
- **文案**：`对于字典 %1 的键 %2 和值 %3 %4`。
- **输入**：`DICT`（`PythonDict`）、`DO`（statement）。
- **字段变量**：`KEY`、`VALUE`。
- **生成**：
  ```python
  for 键, 值 in 数据.items():
      ...
  ```
- **用途**：避免用户自己拼 `items()` 再解包。
- **校验**：`DICT` 必须是字典；空 `DO` 生成 `pass`。
- **工具箱**：字典 / 遍历。
- **硬件**：确认 `.items()` 可用后加入；否则先只放“只遍历键”的 `python_for_in`。

### 4.3 P0：`python_dict_merge`

- **类型**：值积木。
- **文案**：`字典 %1 与字典 %2 合并为新字典`。
- **输入**：`LEFT`、`RIGHT`，都检查 `PythonDict`。
- **输出**：`PythonDict`。
- **生成**：`left | right`，按 `Order.BITWISE_OR` 输出，必要时加括号。
- **语义**：返回新字典，不修改左右两个原字典；右边同名键覆盖左边。
- **兼容性**：Python 3.11–3.14 可用；MicroPython v1.29 不确认支持，**硬件版不放**，硬件用现有 `update`。
- **工具箱**：字典 / 修改。

### 4.4 P0：`python_dict_from_pairs`

- **类型**：值积木。
- **文案**：`用键列表 %1 和值列表 %2 创建字典`。
- **输入**：`KEYS`、`VALUES`，接受 `Array` 或 `PythonTuple`（必须是有序序列；不要接集合，集合顺序不确定）。
- **输出**：`PythonDict`。
- **生成**：`dict(zip(keys, values))`。
- **提示**：长度不一致时 `zip` 按较短的一侧截断，不报错。
- **工具箱**：字典 / 创建。
- **硬件**：`zip` 和 `dict` 在 MicroPython 上通常可用，但必须实机确认后再放。

### 4.5 P0：`python_dict_remove` 增强

- **现状**：固定生成 `数据.pop(键, None)`，键不存在时静默忽略。
- **改动**：增加 `MISSING` 下拉：
  - `忽略`（默认，兼容旧工程）：`数据.pop(键, None)`
  - `报错`：`del 数据[键]`
- **兼容**：旧序列化没有 `MISSING` 字段时取默认值 `ignore`，生成结果不变。
- **工具箱**：字典 / 修改。
- **测试**：两种模式的生成结果；旧状态加载后的默认行为。

### 4.6 P0：`python_set_method` 增强

- **现状**：支持 `add`、`update`、`remove`、`discard`、`pop`、`clear`。
- **改动**：增加：
  - `intersection_update`（原地交集）
  - `difference_update`（原地差集）
  - `symmetric_difference_update`（原地对称差集）
- **参数**：三个方法都显示 `ARG`，标签改为“要比较的集合”；`clear`/`pop` 继续隐藏参数。
- **生成**：`集合.intersection_update(另一个集合)` 等。
- **兼容**：只增加下拉选项，不改旧选项的生成结果。
- **工具箱**：集合 / 修改。
- **硬件**：先在实机确认这三个方法存在；不支持就从硬件分类移除，不删除积木类型。

### 4.7 P1：`python_dict_item`

- **类型**：值积木。
- **文案**：`字典 %1 的键 %2 的值（不存在时报错）`。
- **输入**：`DICT`（`PythonDict`）、`KEY`。
- **输出**：不限。
- **生成**：`数据[键]`。
- **理由**：通用 `python_index` 的文案是“索引”，用在字典上不准确。
- **工具箱**：字典 / 读取。
- **备注**：如果时间紧，可先用 `python_index` 预配置，把新块放 P1。

### 4.8 P1：`python_tuple_unpack`

- **类型**：语句积木。
- **文案**：`把元组 %1 解包为 %2`，带可变目标列表。
- **输入**：`VALUE`（元组或任意可迭代值）、多个 `TARGET0..N` 变量字段、可选 `REST` 剩余变量。
- **生成**：
  - `a, b = 值`
  - `a, b, *剩余 = 值`
- **互斥器**：默认 2 个目标，可增减；`REST` 为空时不生成星号。
- **工具箱**：元组 / 解包。
- **兼容性**：MicroPython 支持基本解包和星号解包；硬件先只放 2～3 个目标的简单形式。

### 4.9 P1：`python_set_from`

- **类型**：值积木。
- **文案**：`从 %1 创建集合（自动去重）`。
- **输入**：任意可迭代值。
- **输出**：`PythonSet`。
- **生成**：`set(值)`。
- **工具箱**：集合 / 创建。
- **备注**：如果不想新增类型，用 `python_convert` 的 `TYPE=set` 预配置即可；两种方案二选一，不要同时做。

### 4.10 P2：`python_dict_sorted_items`

- **文案**：`将字典 %1 按 %2 排序，倒序 %3`。
- **字段**：`SORT_BY`：键 / 值。
- **输入**：`DICT`、`REVERSE`（Boolean）。
- **输出**：`Array`（元素是 `(键, 值)` 元组）。
- **生成**：
  - `sorted(数据.items(), key=lambda 项: 项[0], reverse=倒序)`
  - 按值排序时取 `项[1]`。
- **限制**：只进 Python 桌面工具箱；MicroPython 的 `sorted`/`lambda` 支持未确认，不进硬件。

### 4.11 P2：`python_dict_invert`

- **文案**：`反转字典 %1 的键和值`。
- **输入**：`DICT`。
- **输出**：`PythonDict`。
- **生成**：`{值: 键 for 键, 值 in 数据.items()}`。
- **提示**：原字典有重复值时，后面的键会覆盖前面的键。
- **限制**：只进 Python 桌面工具箱。

### 4.12 P2：`python_namedtuple_instance`

- **现状**：`python_collections_namedtuple` 只创建 `namedtuple` 类型，没有实例化积木。
- **目标**：提供“用命名元组类型 + 字段值创建实例”的入口，具体字段数量由类型决定，设计成本较高。
- **本计划不做**，只保留在 backlog；标准库里的命名元组类型积木继续可用。

---

## 5. 类型系统与告警

### 5.1 推断扩展

`src/pythonSyntaxBlocks.ts` 的 `inferPythonContainerKind` 增加：

| 新积木 | 推断结果 |
| --- | --- |
| `python_dict_view_list` | `list` |
| `python_dict_from_pairs` | `dict` |
| `python_dict_merge` | `dict` |
| `python_set_from` | `set` |
| `python_dict_sorted_items` | `list` |
| `python_dict_invert` | `dict` |
| `python_dict_item` | 不推断（值类型未知） |
| `python_for_dict` | 无输出 |
| `python_tuple_unpack` | 无输出 |

### 5.2 输入类型约束

在 `containerInputExpectations` 中增加：

- `python_dict_view_list`：`DICT` 必须是字典。
- `python_for_dict`：`DICT` 必须是字典。
- `python_dict_merge`：`LEFT`、`RIGHT` 必须是字典。
- `python_dict_from_pairs`：`KEYS`、`VALUES` 接受列表/元组，不接受集合。
- `python_dict_item`：`DICT` 必须是字典。
- `python_set_from`：任意可迭代，不做强类型限制。
- `python_dict_sorted_items`、`python_dict_invert`：`DICT` 必须是字典。

### 5.3 新增告警

| 场景 | 中文提示 |
| --- | --- |
| 集合接索引/切片 | 集合是无序的，不能按位置索引或切片。 |
| 对元组做赋值/删除 | 元组不可修改；请先转换成列表。 |
| 集合元素接列表/字典/集合 | 集合元素必须可哈希，列表/字典/集合不能放进去。 |
| 字典键接列表/字典/集合 | 字典键必须可哈希。 |
| `fromkeys` 默认值是列表/字典 | 所有键会共享同一个可变对象。 |
| 字典 `update` 参数不是字典 | `update` 需要字典（或键值对序列）。 |
| `dict_merge` 左右不是字典 | 合并两侧都必须是字典。 |

实现注意：

- 只对“能推断出来”的情况告警，变量类型未知时不要误报。
- 告警沿用现有 `validatePythonBlockContexts` 的输出，不新增一套错误面板。
- 告警文案用中文，末尾统一加句号。

### 5.4 输出检查

新增类型必须设置正确的输出：

- `python_dict_view_list` → `Array`
- `python_dict_from_pairs` → `PythonDict`
- `python_dict_merge` → `PythonDict`
- `python_set_from` → `PythonSet`
- `python_dict_sorted_items` → `Array`
- `python_dict_invert` → `PythonDict`

`python_for_dict` 和 `python_tuple_unpack` 是语句块，不设置输出。

---

## 6. 工具箱实现

### 6.1 关键约束：同一类型会在多个分类重复

`resolveBoardToolbox` 目前在基础工具箱里按 `type + fields` 找**唯一**条目。四个分类都放 `python_index`、`python_slice`、`python_length`、`python_membership`、`python_for_in` 之后，同一个类型会出现多条；硬件声明再写 `"python_index"` 就会匹配到多条并抛错。

**解决方案（T1 必做）**：给 `ToolboxItemSpec` 增加可选的 `fromCategory`，让硬件声明可以指定“从哪个基础分类取这条预配置”。

```ts
export type ToolboxItemSpec =
  | string
  | { type: string; fields?: Record<string, string | number>; fromCategory?: string }
  | { label: string }
  | { sep: true };
```

解析规则：

- 没有 `fromCategory`：保持现有行为，在全部基础分类里找；匹配多条时仍报错。
- 有 `fromCategory`：只在该名字的基础分类里找；分类不存在时报明确错误。
- 硬件积木（`hardware_*`）忽略 `fromCategory`，仍从硬件条目表取。
- 匹配多条时继续报错，不静默取第一条。

这样硬件可以写：

```ts
{ type: "python_index", fromCategory: "元组" }
```

而不会和「列表」「字典」里的同名积木冲突。

### 6.2 Python 分类拆分

在 `src/pythonBlocks.ts` 的 `toolbox.contents` 中：

1. 把现有 `{ name: "集合" }` 改名为 `{ name: "列表" }`。
2. 只保留列表相关条目：
   - 列表创建、列表方法、插入、索引赋值、切片替换/删除、列表复制、列表推导式、拼接/重复、索引/切片/长度/包含、遍历。
3. 新增 `{ name: "元组" }`，放入第 3.2 节清单。
4. 新增 `{ name: "字典" }`，放入第 3.3 节清单。
5. 新增 `{ name: "集合" }`，放入第 3.4 节清单。
6. 分类顺序：列表 → 元组 → 字典 → 集合。
7. 通用积木允许在多个分类重复出现；Python 工具箱不走唯一性检查。
8. 旧分类名「集合」不再存在，但积木类型不变，旧工程加载不受影响。
9. 通用积木颜色通过工具箱条目的 `extraState: { palette: "list" | "tuple" | "dict" | "set" }` 指定；`installCollectionPalette` 在 `loadExtraState` 时调用 `setColour`，因此同一个 `python_index` 在元组分类里显示绿色，在字典分类里显示金色，不需要复制积木类型。
10. `python_sequence_collection` 不写 palette，颜色由 `KIND` 决定；列表分类的长度仍用 `lists_length`，但要加 `extraState: { palette: "list" }` 并纳入 `installCollectionPalette`，否则 Blockly 内置列表样式无法跟随分类色。

### 6.3 硬件通用分类

在 `src/hardware/toolboxes/common.ts` 增加：

```ts
export const tupleCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({ ... });
export const dictCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({ ... });
export const setCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({ ... });
```

要点：

- 颜色继续用 `baseCategoryColour("列表")`，不要继续引用已不存在的「集合」。
- 现有 `listCategory()` 里的 `"python_index"` 改成 `{ type: "python_index", fromCategory: "列表" }`。
- 新增分类里所有重复的通用块都带 `fromCategory`，包括但不限于 `python_index`、`python_slice`、`python_length`、`python_membership`、`python_for_in`、`python_for_enumerate`、`python_sequence_query`、`python_sequence_combine`、`python_builtin_zip`。
- `python_convert` 已经由硬件 `textCategory()` 暴露（基础条目在「输入输出」）；字典/集合分类需要转换时，用 `{ type: "python_convert", fromCategory: "输入输出" }`，不要重复匹配。
- 如果某个类型只在某一个分类出现，可以继续用字符串写法；不要为了统一而给所有条目都加 `fromCategory`。
- 硬件分类不直接引用 Python 的 `toolbox` 对象，仍走 `ToolboxItemSpec` 白名单。

### 6.4 三块板卡

在 `esp32-s3.ts`、`esp32-wroom.ts`、`esp8266-esp12e.ts` 的 `categories` 中，在 `listCategory()` 后插入：

```ts
tupleCategory(),
dictCategory(),
setCategory(),
```

如果某块板卡暂不支持某个积木，通过 `extra` 或后续筛选移除；不要用假条目占位。

如果实机确认某块板卡的固件没有启用 `set`，该板卡的 `categories` 不要写 `setCategory()`，用条件展开：

```ts
...(supportsSet ? [setCategory()] : []),
```

`supportsSet` 是板卡常量，不做运行时探测；没有确认前一律为 `false`。

### 6.5 MicroPython 子集

| 能力 | S3 | WROOM | 8266 | 说明 |
| --- | --- | --- | --- | --- |
| 元组创建/索引/切片/长度/包含/遍历 | 待验证 | 待验证 | 待验证 | 基础能力，优先做 |
| 元组 count/index、拼接/重复 | 待验证 | 待验证 | 待验证 | 不支持就从对应板卡移除 |
| 元组解包 | 待验证 | 待验证 | 待验证 | 先放 2～3 个目标 |
| 字典创建/get/set/删除/长度/遍历键 | 待验证 | 待验证 | 待验证 | 基础能力，优先做 |
| 字典 keys/values/items | 待验证 | 待验证 | 待验证 | `.items()` 是 `for_dict` 的前提 |
| 字典视图转列表 | 待验证 | 待验证 | 待验证 | 依赖 `list()` |
| 字典 update/clear | 待验证 | 待验证 | 待验证 | 现有方法 |
| 字典键值对遍历 | 待验证 | 待验证 | 待验证 | 依赖 `.items()` 和解包 |
| 字典 fromkeys | 待验证 | 待验证 | 待验证 | 不支持就移除 |
| 字典 popitem/setdefault | 待验证 | 待验证 | 待验证 | 先不放，实机确认后再加 |
| 字典 `\|` 合并 | ❌ | ❌ | ❌ | MicroPython 不确认支持，硬件不放 |
| 字典排序/反转 | ❌ | ❌ | ❌ | 依赖 `sorted`/lambda，桌面版 P2 |
| 集合创建/增删/长度/遍历 | 待验证 | 待验证 | 待验证 | 先确认固件启用 `set` |
| 集合 union/intersection/difference/对称差 | 待验证 | 待验证 | 待验证 | 实机确认 |
| 集合原地 update 运算 | 待验证 | 待验证 | 待验证 | 实机确认后再放 |
| 集合关系 | 待验证 | 待验证 | 待验证 | 实机确认 |
| 集合推导式 | 待验证 | 待验证 | 待验证 | 不支持就不放 |
| namedtuple / frozenset | ❌ | ❌ | ❌ | 本计划不做 |

**关键风险**：MicroPython 的 `set` 是否在 v1.29.0 的三块固件里启用，必须实机确认。如果某块板卡不支持，宁可不显示「集合」分类，也不要用运行时报错。

---

## 7. 文件改动清单

| 文件 | 改动 |
| --- | --- |
| `src/pythonBlocks.ts` | 四分类拆分；新增块定义/生成器；P0/P1 工具箱条目 |
| `src/pythonSyntaxBlocks.ts` | 容器类型推断、输入期望、告警；集合索引/元组修改/哈希性检查 |
| `src/hardware/toolboxes/types.ts` | `ToolboxItemSpec` 增加 `fromCategory` |
| `src/hardware/toolboxes/resolve.ts` | 按 `fromCategory` 限定基础分类；缺失分类报错 |
| `src/hardware/toolboxes/common.ts` | `tupleCategory` / `dictCategory` / `setCategory`；`listCategory` 改用 `fromCategory` |
| `src/hardware/toolboxes/esp32-s3.ts` | 插入三个分类 |
| `src/hardware/toolboxes/esp32-wroom.ts` | 插入三个分类 |
| `src/hardware/toolboxes/esp8266-esp12e.ts` | 插入三个分类 |
| `src/pythonBlocks.test.ts` | 分类结构、生成器、空/单元素、类型告警、工具箱加载 |
| `src/hardware/toolboxes/resolve.test.ts` | `fromCategory` 选择、缺失分类、重复匹配 |
| `src/hardware/toolboxes/common.test.ts` | 新分类声明和颜色 |
| `src/hardware/toolboxes/esp32-s3.test.ts` | 分类顺序、字典/集合出现、搜索索引 |
| `src/hardware/toolboxes/esp32-s3.search.test.ts` | “字典”搜索不再为空 |
| `src/hardware/toolboxes/boardToolboxes.test.ts` | 三块板卡分类与类型断言 |
| `src/profiles/profileToolbox.test.ts` | Profile 工具箱分类预期 |
| `docs/hardware/collections_smoke.py` | 新增真机烟测脚本 |
| `docs/hardware/README.md` | 记录烟测结果与未验证项 |
| `docs/superpowers/plans/2026-10-23-collection-toolboxes.md` | 本文件；实施后更新状态 |

不改：

- `src/App.tsx`
- Rust `src-tauri/`
- 固件目录
- 设备写入协议

---

## 8. 实施任务

### T0：记录基线

**步骤**

1. 运行：
   ```bash
   npx tsc --noEmit
   npm test
   npm run build
   ```
2. 记录 Python 与三块板卡的分类数、条目数。
3. 记录当前工作区已有的未提交改动；不要回滚，也不要把它们混入本次提交。

**验收**

- 三个命令的输出与本文基线一致；如果不一致，先停止并说明差异。

---

### T1：扩展工具箱解析器（前置）

**状态**：已完成（2026-10-23）。`ToolboxItemSpec` 已增加 `fromCategory`；解析器只在指定基础分类里找条目，缺失分类报错，硬件类型忽略该字段；新增 3 个测试，全量 119 文件 / 1230 用例通过。

**文件**

- `src/hardware/toolboxes/types.ts`
- `src/hardware/toolboxes/resolve.ts`
- `src/hardware/toolboxes/resolve.test.ts`

**步骤**

1. `ToolboxItemSpec` 增加 `fromCategory?: string`。
2. `baseEntries` 支持按分类名过滤；分类不存在时抛出：
   ```
   工具箱里没有名为「X」的分类（分类 Y）
   ```
3. `findEntry` 把 `fromCategory` 传下去；硬件类型忽略该字段。
4. 保持“无 `fromCategory` 且匹配多条”时继续报错。
5. 增加测试：
   - 同一类型在两个基础分类各有一条，`fromCategory` 能选对；
   - `fromCategory` 不存在时抛错；
   - 无 `fromCategory` 且多条时仍抛“匹配到多个条目”。

**验收**

- `npx vitest run src/hardware/toolboxes/resolve.test.ts` 通过。
- 现有硬件工具箱测试仍通过。

---

### T2：拆分 Python 四分类

**状态**：已完成（2026-10-23）。Python 工具箱已拆成「列表 / 元组 / 字典 / 集合」四个一级分类；旧分类「集合」改为「列表」；新增分类先只放已有积木和预配置；四个分类使用不同色条（`#7657b5` / `#2e8b57` / `#b8860b` / `#c04a6a`），通用积木通过 `extraState.palette` 与分类同色，分类内所有积木颜色一致。另外把 Matplotlib / Pandas / NumPy 的嵌套子分类色统一为各自插件主色。为了保持现有硬件工具箱可用，`common.ts` 中重复的 `python_index`、`python_convert` 已改用 `fromCategory`（分别指向「列表」「输入输出」）；`listCategory` 的颜色改为取「列表」。全量 119 文件 / 1233 用例通过。

**文件**

- `src/pythonBlocks.ts`
- `src/pythonBlocks.test.ts`
- `src/hardware/toolboxes/common.ts`（只改重复条目的 `fromCategory` 和列表颜色）

**步骤**

1. 把现有「集合」分类改名「列表」，移除元组/字典/集合专属条目。
2. 新增「元组」「字典」「集合」分类，先只放已有积木和预配置。
3. 顺序固定为 列表 → 元组 → 字典 → 集合。
4. 更新 `collectionToolboxBlock`、`dictionaryShadow`、`tupleShadow`、`setShadow` 等辅助函数，确保新分类条目加载时不缺根输入。
5. 更新测试里的 `configuredToolboxBlock("集合", ...)` 到新分类名。
6. 不新增积木类型，不改变旧积木生成器。

**验收**

- Python 工具箱恰有四个容器分类，顺序正确。
- 每个分类的静态条目能加载，根输入检查通过。
- 旧工程序列化加载测试通过。
- `npm test` 全部通过。

---

### T3：P0 新积木与增强

**状态**：已完成（2026-10-23）。已新增 `python_dict_view_list`、`python_for_dict`、`python_dict_merge`、`python_dict_from_pairs`；`python_dict_remove` 增加“不存在时忽略/报错”；`python_set_method` 增加三种原地集合运算。生成器、工具箱条目、输出类型和参数可见性测试均已补齐。

**文件**

- `src/pythonBlocks.ts`
- `src/pythonBlocks.test.ts`

**步骤**

1. 新增 `python_dict_view_list`、`python_for_dict`、`python_dict_merge`、`python_dict_from_pairs`。
2. 增强 `python_dict_remove`：增加 `MISSING` 字段，默认 `ignore`。
3. 增强 `python_set_method`：增加三种原地运算，参数显示/隐藏逻辑同步。
4. 实现生成器；注意 `dict_merge` 的运算符优先级、`for_dict` 的 `pass`、`from_pairs` 的空输入。
5. 把这些积木放进对应分类。
6. 增加测试：
   - 每种生成器的精确输出；
   - 空字典/空列表输入；
   - `dict_remove` 两种模式；
   - `set_method` 三种新方法及参数可见性；
   - 工具箱条目根输入检查。

**验收**

- 新积木能拖出、能生成正确代码。
- 旧积木生成结果不变。
- `npx tsc --noEmit`、相关测试通过。

---

### T4：类型推断与告警

**状态**：已完成（2026-10-23）。已识别新字典积木的容器类型；新增字典视图/遍历/合并/双列表建字典的输入约束；增加集合索引/切片、元组修改、集合元素不可哈希、字典键不可哈希、`fromkeys` 可变默认值告警。错误类型连接会进入问题面板。

**文件**

- `src/pythonSyntaxBlocks.ts`
- `src/pythonBlocks.test.ts`

**步骤**

1. 扩展 `inferPythonContainerKind`。
2. 扩展 `containerInputExpectations`。
3. 增加集合索引/切片、元组修改、哈希性、`fromkeys` 默认值告警。
4. 确保未知变量类型不误报。
5. 增加测试，覆盖每条告警和“不应告警”的反例。

**验收**

- 错误类型连接时，问题面板显示中文提示。
- 正确类型连接时没有提示。
- 现有集合类型测试不回归。

---

### T5：硬件四分类

**状态**：已完成（2026-10-23）。S3 / WROOM / 8266 均在「列表」后加入「元组 / 字典 / 集合」；分类通过 `fromCategory` 克隆带 palette 的 Python 工具箱条目，分类色与积木色一致；硬件白名单已同步，字典合并 `dict |` 只保留在桌面版。三块板卡的分类顺序、容器积木、颜色一致性和搜索索引均有测试。

**文件**

- `src/hardware/toolboxes/common.ts`
- `src/hardware/toolboxes/esp32-s3.ts`
- `src/hardware/toolboxes/esp32-wroom.ts`
- `src/hardware/toolboxes/esp8266-esp12e.ts`
- 对应测试

**步骤**

1. 新增 `tupleCategory`、`dictCategory`、`setCategory`。
2. `listCategory` 的重复类型改用 `fromCategory`。
3. 三块板卡按 `list → tuple → dict → set` 插入分类。
4. 硬件只放第 6.5 节确认支持的积木；未确认的先不放。
5. 更新分类数、分类顺序、搜索索引测试。
6. 删除或改写“硬件搜索字典为空”“硬件不含 dict_get”等旧断言。

**验收**

- 三块板卡都出现四个容器分类。
- 每个分类解析后都有真实条目，不出现空分类。
- 不存在 `fromCategory` 匹配多条的错误。
- 搜索“字典”“元组”“集合”能搜到对应积木。

---

### T6：P1 积木（可选，但建议本次一起）

**状态**：已完成（2026-10-23）。新增 `python_dict_item`（按键直接读取）和 `python_tuple_unpack`（复用解包目标，支持 2～3 个目标和星号剩余项）；`python_set_from` 按计划复用现有 `python_convert`，没有新增重复类型；两者已进入 Python 与三块硬件板卡的对应分类。

**文件**

- `src/pythonBlocks.ts`
- `src/pythonSyntaxBlocks.ts`
- 测试

**步骤**

1. 新增 `python_dict_item`、`python_tuple_unpack`。
2. `python_set_from` 与 `python_convert` 二选一；优先用转换积木，不新增重复类型。
3. 加生成器、类型约束、工具箱条目。
4. 元组解包先支持 2～3 个目标和可选剩余变量。
5. 测试生成、互斥器、默认值。

**验收**

- 字典直接按键读取有明确标签。
- 元组解包可以生成 `a, b = 值` 和 `a, b, *剩余 = 值`。
- 不与 `python_assign_target` 的旧用法冲突。

---

### T7：烟测脚本与文档

**状态**：已完成（2026-10-23）。新增 `docs/hardware/collections_smoke.py`，覆盖元组、字典、集合的核心运行时行为；`docs/hardware/README.md` 增加运行方式、预期输出与三块板卡的“未执行”记录表；`docs/hardware-blocks.md` 更新条目数与验证状态。脚本已在本机 CPython 跑通，但**尚未在 MicroPython 真机运行**。

**文件**

- `docs/hardware/collections_smoke.py`
- `docs/hardware/README.md`
- `docs/hardware-blocks.md`（如果硬件分类有变化）

**烟测脚本内容**

在设备上依次检查：

1. 元组创建、索引、切片、长度、count、拼接、解包。
2. 字典创建、get、set、删除（忽略）、keys/values/items、遍历键值、fromkeys。
3. 集合创建、add、discard、union、intersection、difference、关系、遍历。
4. 每项打印 `PASS` / `FAIL` / `SKIP`，最后输出：
   ```
   COLLECTIONS RESULT: n/n checks passed
   ```

**注意**

- 不测试 `dict |`、namedtuple、排序、`popitem`、`setdefault`，除非已单独确认。
- 脚本要能在 ESP8266（当前 COM3）运行；S3/WROOM 没有硬件时记录为未验证。
- 结果写入 `docs/hardware/README.md` 的验证表。

**验收**

- 脚本存在、可在设备上运行、结果可复制。
- README 记录日期、板卡、固件版本和逐项结果。

---

### T8：真机验收

**状态**：已完成（2026-10-23）。ESP8266-ESP12E（COM3，v1.29.0）运行 `collections_smoke.py`：**11/11 PASS**，元组、字典、集合全部通过。首次运行发现元组/字符串的扩展切片（`[::2]`）在 ESP8266 上抛 `NotImplementedError`，已把硬件元组切片改为不带步长的 `python_slice_basic`；列表扩展切片仍正常。S3 / WROOM 手头没有硬件，记录为**未验证**，不冒充通过。

**步骤**

1. 连接 ESP8266（COM3，CH340，4 MB，v1.29.0）。
2. 运行 `collections_smoke.py`。
3. 记录每项 PASS/FAIL/SKIP。
4. 如果 `set` 不可用，回退方案：从该板卡工具箱移除「集合」分类，保留代码生成积木但不展示；不要假装通过。
5. S3/WROOM 没有硬件时，在 README 明确写“未验证”。
6. 如果用户提供 S3/WROOM，再补跑；不要用 ESP8266 结果代替。

**验收**

- 至少有 ESP8266 的原始输出和结果表。
- 未验证项明确标注，不写“全部通过”。

---

## 9. 测试矩阵

| 范围 | 测试文件 | 关键用例 |
| --- | --- | --- |
| 解析器分类选择 | `src/hardware/toolboxes/resolve.test.ts` | `fromCategory` 正确/缺失/多条 |
| Python 分类结构 | `src/pythonBlocks.test.ts` | 四分类顺序、条目加载、旧工程兼容 |
| 生成器 | `src/pythonBlocks.test.ts` | 新积木精确输出、空输入、单元素 |
| 类型告警 | `src/pythonBlocks.test.ts` | 集合索引、元组修改、哈希性、fromkeys |
| 硬件通用分类 | `src/hardware/toolboxes/common.test.ts` | 分类解析、颜色、条目 |
| S3 工具箱 | `src/hardware/toolboxes/esp32-s3.test.ts` | 分类顺序、积木存在、连接类型 |
| S3 搜索 | `src/hardware/toolboxes/esp32-s3.search.test.ts` | “字典/元组/集合”可搜到 |
| 三块板卡 | `src/hardware/toolboxes/boardToolboxes.test.ts` | 分类数、白名单、无空分类 |
| Profile | `src/profiles/profileToolbox.test.ts` | 硬件/ Python 分类预期 |
| 全量 | `npm test` | 所有测试 |
| 构建 | `npm run build` | 产物可构建 |
| 真机 | `docs/hardware/collections_smoke.py` | 设备运行时行为 |

---

## 10. 验收标准

### 10.1 功能

- [ ] Python 工具箱有「列表」「元组」「字典」「集合」四个一级分类，顺序正确。
- [ ] 三块硬件板卡都有这四个分类。
- [ ] 字典视图可转列表。
- [ ] 可以同时遍历字典的键和值。
- [ ] 可以合并两个字典为新字典（桌面版）。
- [ ] 可以用键列表和值列表创建字典。
- [ ] 删除字典键时可以选择忽略或报错。
- [ ] 集合支持三种原地运算。
- [ ] 元组可以解包到多个变量（P1）。
- [ ] 集合去重有明确入口（P1 或转换积木预配置）。

### 10.2 兼容性

- [ ] 旧工程里的 `python_tuple`、`python_set`、`python_dict`、`python_dynamic_dict` 等仍能加载。
- [ ] 旧工具箱条目没有因为分类改名而丢失。
- [ ] `python_dict_remove` 旧状态仍生成 `pop(key, None)`。
- [ ] 硬件工具箱不因 `fromCategory` 解析失败。

### 10.3 质量

- [ ] `npx tsc --noEmit` 通过。
- [ ] `npm test` 全部通过。
- [ ] `npm run build` 通过。
- [ ] 新增/修改测试覆盖生成器、类型告警、工具箱结构、解析器。
- [ ] 真机结果与未验证项分开记录。

---

## 11. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 同一类型在四个分类重复，硬件解析报“匹配到多个条目” | T5 阻塞 | 先做 T1 的 `fromCategory`，所有重复条目都带分类 |
| MicroPython 固件未启用 `set` | 集合分类无法使用 | 先跑烟测；不支持就从该板卡移除分类，保留桌面版 |
| MicroPython 不支持 `dict \|` | 硬件字典合并不可用 | 硬件不放 `python_dict_merge`，用 `update` |
| `popitem`/`setdefault` 在固件上缺失 | 硬件方法运行时报错 | 先不放，实机确认后再加 |
| `sorted(key=...)` / lambda 不可用 | 字典排序不可用 | 只做桌面 P2，不进硬件 |
| 四个分类让工具箱变长 | 用户查找成本上升 | 分类内用小节标题；搜索索引覆盖新类型 |
| 旧测试断言“字典搜索为空” | 测试失败 | 在 T5 明确改写为“可搜到”，不要绕过 |
| `python_dict_remove` 增强破坏旧代码 | 旧工程行为变化 | `MISSING` 默认 `ignore`，生成结果完全不变 |
| `fromkeys` 可变默认值被误用 | 运行期共享对象 | tooltip + 类型告警 |
| S3/WROOM 无硬件 | 无法真机验收 | 明确记录“未验证”，不冒充通过 |

---

## 12. 实施顺序与范围建议

建议按以下顺序落地：

1. **T1** 解析器 `fromCategory`（不然后面必炸）。
2. **T2** Python 四分类拆分（只动已有积木）。
3. **T3** P0 新积木与两个增强。
4. **T4** 类型推断与告警。
5. **T5** 三块板卡硬件分类。
6. **T7** 烟测脚本。
7. **T8** ESP8266 真机；S3/WROOM 等有硬件再补。
8. **T6** P1 作为第二批；P2 只记录，不在本次实现。

如果用户希望一次到位，建议本次做 **T1–T5 + T7**，P1 的 `dict_item`、`tuple_unpack` 可以顺带，P2 全部留到后续。

---

## 13. 遗留问题

- 命名元组实例化：现有 `python_collections_namedtuple` 只创建类型，缺少实例构造入口。
- `frozenset`：需要新的输出类型和硬件兼容性确认。
- 嵌套字典路径读取：需要确定路径表达方式和缺失键策略。
- 字典按值排序：需要确认排序稳定性、重复值和硬件兼容性。
- 硬件 `set` 的实际可用性：以 ESP8266 烟测为准，不能凭文档假设。
