import type { PluginBlockAgentMetadata } from "../../api/types";

/**
 * Agent-facing knowledge for Manim blocks. The plugin declares rich metadata here
 * because the search index otherwise only sees the block label and toolbox
 * category, which makes task ranking weak (every Manim block looks the same).
 *
 * `curated` entries add task synonyms and recommendations for the most common
 * blocks. `familyRules` fill purpose, tags and keywords for every other block
 * based on its toolbox category path.
 */

const curated: Record<string, PluginBlockAgentMetadata> = {
  // 场景与流程
  visual_python_manim_scene: {
    purpose: "创建一个 Manim 动画场景（整体入口），所有对象创建和动画播放都写在场景的 BODY 中",
    aliases: ["场景", "舞台", "动画入口", "视频入口"],
    keywords: ["scenestart", "主场景"],
    recommendedFor: ["整体动画", "动画视频"],
    relatedBlocks: ["visual_python_manim_play", "visual_python_manim_wait"],
  },
  visual_python_manim_assign: {
    purpose: "创建并命名对象：把对象保存为指定名称，后续动画、引用、追踪都通过这个名字使用它",
    aliases: ["命名对象", "创建并命名", "保存对象", "赋值"],
    keywords: ["assign", "命名"],
    relatedBlocks: ["visual_python_manim_object_ref", "visual_python_manim_assign_add"],
  },
  visual_python_manim_object_ref: {
    purpose: "按名称引用已创建的对象；引用前必须先用“创建并命名对象”积木命名，名字必须与命名积木完全一致",
    aliases: ["对象引用", "引用对象", "引用"],
    keywords: ["reference", "已有对象"],
    relatedBlocks: ["visual_python_manim_assign"],
  },
  visual_python_manim_play: {
    purpose: "播放一段动画：执行一个动画效果（出现、移动、变形、强调等）",
    aliases: ["播放", "运行动画", "执行动画"],
    keywords: ["play", "动画播放"],
    recommendedFor: ["播放动画"],
    relatedBlocks: ["visual_python_manim_play_with_options", "visual_python_manim_play_two", "visual_python_manim_play_list"],
  },
  visual_python_manim_play_with_options: {
    purpose: "以自定义播放时长和延迟比例播放单个动画",
    aliases: ["播放控制", "调节动画速度"],
    keywords: ["时长", "延迟"],
  },
  visual_python_manim_play_two: {
    purpose: "同时播放两个动画（并行动画）",
    aliases: ["同时播放", "并行动画", "一起播放"],
    keywords: ["同时", "并行"],
  },
  visual_python_manim_play_list: {
    purpose: "批量播放动画列表：按顺序依次播放多个动画",
    aliases: ["批量播放", "依次播放", "顺序播放"],
    keywords: ["列表", "批量"],
  },
  visual_python_manim_wait: {
    purpose: "保持当前画面等待指定秒数（停留/暂停）",
    aliases: ["等待", "停留", "暂停", "延时"],
    keywords: ["秒", "sleep"],
  },
  visual_python_manim_add: {
    purpose: "把已经创建但未加入场景的对象显示到画面中（添加到场景）",
    aliases: ["显示对象", "加入场景", "显示"],
    keywords: ["add", "显示出来"],
  },
  visual_python_manim_remove: {
    purpose: "从场景中移除一个对象（瞬间消失，不带动画）",
    aliases: ["移除对象", "删除对象"],
    keywords: ["消失"],
    avoidFor: ["淡出动画"],
  },
  visual_python_manim_clear: {
    purpose: "清空场景中的全部对象",
    aliases: ["清空画面", "全部移除"],
    keywords: ["重置画面"],
  },
  visual_python_manim_camera_frame_animation: {
    purpose: "移动镜头对准目标对象（相机镜头动画/特写）",
    aliases: ["镜头", "特写", "聚焦", "摄像机"],
    keywords: ["camera", "zoom"],
    intentTags: ["camera", "animation"],
  },
  visual_python_manim_3d_ambient_rotation: {
    purpose: "让三维相机持续环绕旋转（3D 展示视角）",
    aliases: ["环绕旋转", "转起来", "3D旋转展示"],
    keywords: ["ambient", "环绕"],
  },
  visual_python_manim_voiceover: {
    purpose: "播放配音（旁白解说）：按角色生成或播放语音",
    aliases: ["旁白", "语音", "解说", "配音讲解"],
    keywords: ["tts", "语音合成", "朗读"],
    recommendedFor: ["讲解视频"],
  },
  visual_python_manim_voiceover_with_animation: {
    purpose: "播放配音并同时执行内部动画（旁白配合画面）",
    aliases: ["配音同步", "边讲边演示"],
    keywords: ["旁白动画"],
    recommendedFor: ["讲解视频"],
  },
  visual_python_manim_play_local_audio: {
    purpose: "播放本地音频文件（背景音乐/音效）",
    aliases: ["音乐", "音效", "背景音乐", "bgm"],
    keywords: ["音频文件", "audio"],
  },

  // 对象
  visual_python_manim_plain_text_object: {
    purpose: "创建普通文本对象（可设置内容、字号与颜色）",
    aliases: ["文字", "文本", "标签文字", "标题文字"],
    recommendedFor: ["标题", "说明文字"],
    relatedBlocks: ["visual_python_manim_write_animation"],
  },
  visual_python_manim_mathtex_object: {
    purpose: "创建数学公式对象（LaTeX 排版），用于显示公式",
    aliases: ["公式", "数学公式", "LaTeX", "方程"],
    recommendedFor: ["公式推导", "数学讲解"],
  },
  visual_python_manim_tex_object: {
    purpose: "创建公式文本对象（LaTeX 排版）",
    aliases: ["公式文本", "LaTeX"],
    recommendedFor: ["公式展示"],
  },
  visual_python_manim_circle_object: {
    purpose: "创建圆形对象，可用于几何演示或弹跳小球等圆形动画的主角",
    aliases: ["圆", "圆形", "圆圈", "小球", "圆形轮廓"],
    keywords: ["ball", "circle"],
    recommendedFor: ["圆形", "弹跳小球", "几何演示"],
    relatedBlocks: ["visual_python_manim_animate_shift", "visual_python_manim_animate_scale"],
  },
  visual_python_manim_square_object: {
    purpose: "创建正方形对象",
    aliases: ["正方形", "方块", "方框"],
    keywords: ["box", "方形"],
    recommendedFor: ["几何图形"],
  },
  visual_python_manim_rectangle_object: {
    purpose: "创建矩形对象（长方形）",
    aliases: ["矩形", "长方形", "方框"],
    recommendedFor: ["几何图形"],
  },
  visual_python_manim_line_segment_object: {
    purpose: "创建直线段对象：从起点到终点的一条直线",
    aliases: ["线段", "直线", "线条"],
    keywords: ["line", "连接"],
  },
  visual_python_manim_arrow_object: {
    purpose: "创建箭头对象：从起点指向终点的箭头，可做标注或向量示意",
    aliases: ["箭头", "指向"],
    keywords: ["arrow", "矢量"],
    recommendedFor: ["标注方向"],
  },
  visual_python_manim_dot_object: {
    purpose: "创建一个点（小圆点），可用于标记位置",
    aliases: ["点", "圆点", "标记点"],
    keywords: ["dot", "位置标记"],
  },
  visual_python_manim_triangle_object: {
    purpose: "创建三角形对象",
    aliases: ["三角形", "三角"],
    recommendedFor: ["几何图形"],
  },
  visual_python_manim_regular_polygon_object: {
    purpose: "创建正多边形对象（正三角形、正五边形、正六边形等）",
    aliases: ["正多边形", "正五边形", "正六边形"],
    recommendedFor: ["几何图形"],
  },
  visual_python_manim_ellipse_object: {
    purpose: "创建椭圆对象",
    aliases: ["椭圆"],
    recommendedFor: ["几何图形"],
  },
  visual_python_manim_axes_object: {
    purpose: "创建二维坐标系对象（带坐标轴），用于绘制函数图像",
    aliases: ["坐标轴", "坐标系", "axes", "平面直角坐标系"],
    keywords: ["横轴", "纵轴", "数轴图"],
    recommendedFor: ["函数图像", "坐标系绘图", "数学演示"],
    relatedBlocks: ["visual_python_manim_axes_plot", "visual_python_manim_axis_labels"],
  },
  visual_python_manim_number_line_object: {
    purpose: "创建数轴对象（带刻度与数字）",
    aliases: ["数轴", "刻度线"],
    keywords: ["刻度", "数字轴"],
    recommendedFor: ["数值范围", "数学演示"],
  },
  visual_python_manim_number_plane_object: {
    purpose: "创建平面网格对象（坐标纸）",
    aliases: ["网格", "坐标纸", "平面网格"],
    keywords: ["grid"],
  },
  visual_python_manim_three_d_axes_object: {
    purpose: "创建三维坐标系对象",
    aliases: ["三维坐标系", "3D坐标轴"],
    keywords: ["3d", "三维"],
    recommendedFor: ["3D 函数图像"],
  },
  visual_python_manim_sphere_object: {
    purpose: "创建球体对象（3D 立体图形）",
    aliases: ["球", "球体", "小球3d"],
    keywords: ["sphere", "三维"],
    recommendedFor: ["3D 展示"],
  },
  visual_python_manim_cube_object: {
    purpose: "创建立方体对象（3D 立体图形）",
    aliases: ["立方体", "正方体", "魔方"],
    keywords: ["cube", "三维"],
    recommendedFor: ["3D 展示"],
  },
  visual_python_manim_group_object: {
    purpose: "把多个对象组合成一个整体（成组），一起移动或变换",
    aliases: ["组合", "成组", "编组"],
    keywords: ["group", "整体"],
    recommendedFor: ["多个对象一起操作"],
  },
  visual_python_manim_brace: {
    purpose: "创建大括号标注，指向某个对象",
    aliases: ["大括号", "花括号标注"],
    keywords: ["标注"],
  },
  visual_python_manim_table_object: {
    purpose: "创建表格对象（显示行列数据）",
    aliases: ["表格", "数据表"],
    keywords: ["table", "数据"],
    recommendedFor: ["数据展示"],
  },
  visual_python_manim_matrix_object: {
    purpose: "创建矩阵对象（数学矩阵排版）",
    aliases: ["矩阵", "数学矩阵"],
    keywords: ["matrix"],
  },

  // 坐标方法
  visual_python_manim_axes_plot: {
    purpose: "在坐标系中绘制函数曲线：把函数表达式画成图像",
    aliases: ["画函数", "函数图像", "函数曲线", "正弦曲线", "余弦曲线", "抛物线"],
    keywords: ["plot", "graph", "sin", "cos", "lambda", "绘图"],
    recommendedFor: ["函数图像", "数学教学"],
    relatedBlocks: ["visual_python_manim_axes_object", "visual_python_manim_play"],
  },
  visual_python_manim_axes_area: {
    purpose: "给函数曲线与横轴之间的区域填充面积（积分区域）",
    aliases: ["面积", "积分区域", "填充面积"],
    keywords: ["area"],
    recommendedFor: ["定积分演示"],
  },
  visual_python_manim_axis_labels: {
    purpose: "给坐标轴添加 x、y 轴标签",
    aliases: ["轴标签", "坐标标签"],
    keywords: ["axis labels"],
  },

  // 动画效果
  visual_python_manim_create_object_animation: {
    purpose: "播放创建动画：让对象像被画出来一样逐渐出现（Create）",
    aliases: ["出现", "画出", "绘制出现", "显示动画"],
    keywords: ["create", "appear"],
    recommendedFor: ["对象出现"],
    relatedBlocks: ["visual_python_manim_play"],
  },
  visual_python_manim_write_animation: {
    purpose: "播放书写动画：让文字像手写打字一样逐渐出现（打字机效果）",
    aliases: ["打字机", "手写", "打字", "书写", "打字机效果"],
    keywords: ["write", "typewriter"],
    recommendedFor: ["文字动画", "打字机效果"],
    relatedBlocks: ["visual_python_manim_plain_text_object", "visual_python_manim_play"],
  },
  visual_python_manim_fade_in_animation: {
    purpose: "播放淡入动画：对象逐渐显现（渐显），可带方向和缩放",
    aliases: ["淡入", "渐显", "浮现"],
    keywords: ["fade in"],
    recommendedFor: ["对象出现"],
  },
  visual_python_manim_fade_out_animation: {
    purpose: "播放淡出动画：对象逐渐消失（渐隐）",
    aliases: ["淡出", "渐隐", "消失动画"],
    keywords: ["fade out"],
    recommendedFor: ["对象消失"],
  },
  visual_python_manim_uncreate_animation: {
    purpose: "反向播放创建动画：让对象像被擦除一样消失",
    aliases: ["反向绘制", "擦除", "消失"],
    keywords: ["uncreate"],
  },
  visual_python_manim_transform_to_animation: {
    purpose: "播放变形动画：让一个对象平滑变形成另一个对象（变形/变换）",
    aliases: ["变形", "变换", "变成", "转换", "形状变化"],
    keywords: ["transform", "morph"],
    recommendedFor: ["形状变化", "对象转换"],
    relatedBlocks: ["visual_python_manim_play", "visual_python_manim_circle_object", "visual_python_manim_square_object"],
  },
  visual_python_manim_animate_shift: {
    purpose: "播放移动动画：让对象沿方向/向量平移，可用于弹跳、运动路径等",
    aliases: ["移动", "平移", "位移", "运动", "移动动画"],
    keywords: ["move", "shift", "弹跳", "轨迹", "上下运动"],
    recommendedFor: ["物体运动", "弹跳动画"],
    relatedBlocks: ["visual_python_manim_play"],
  },
  visual_python_manim_animate_move_to: {
    purpose: "播放移动到指定点的动画（对象滑到目标位置）",
    aliases: ["移动到", "滑到", "位移到点"],
    keywords: ["move to"],
  },
  visual_python_manim_animate_rotate: {
    purpose: "播放旋转动画：让对象转动指定角度",
    aliases: ["旋转", "转动", "旋转动画"],
    keywords: ["rotate", "spin"],
    recommendedFor: ["旋转效果"],
  },
  visual_python_manim_animate_scale: {
    purpose: "播放缩放动画：让对象放大或缩小指定倍数",
    aliases: ["缩放", "放大", "缩小", "缩放动画"],
    keywords: ["scale", "zoom"],
    recommendedFor: ["大小变化"],
  },
  visual_python_manim_animate_set_color: {
    purpose: "播放颜色变化动画：让对象平滑变为目标颜色",
    aliases: ["变色", "颜色过渡", "颜色动画"],
    keywords: ["color", "渐变色"],
  },
  visual_python_manim_grow_from_center_animation: {
    purpose: "播放从中心生长动画：对象从中心弹出出现",
    aliases: ["弹出", "生长出现", "从中心出现"],
    keywords: ["grow"],
  },
  visual_python_manim_spin_in_from_nothing_animation: {
    purpose: "播放旋转出现动画：对象旋转着弹出来",
    aliases: ["旋转出现", "转出来", "旋转冒出"],
    keywords: ["spin in"],
  },
  visual_python_manim_shrink_to_center_animation: {
    purpose: "播放向中心收缩消失动画",
    aliases: ["收缩消失", "缩回到中心"],
    keywords: ["shrink"],
  },
  visual_python_manim_indicate_animation: {
    purpose: "播放强调动画：闪烁并放大目标对象以吸引注意（Indicate）",
    aliases: ["强调", "高亮", "提示", "闪烁强调"],
    keywords: ["highlight", "indicate"],
    recommendedFor: ["强调重点"],
  },
  visual_python_manim_circumscribe_animation: {
    purpose: "播放圈出动画：用矩形等形状框住目标对象（圈重点）",
    aliases: ["圈出", "框选", "画框", "圈重点"],
    keywords: ["circumscribe", "box"],
    recommendedFor: ["强调重点"],
  },
  visual_python_manim_wiggle_animation: {
    purpose: "播放摆动动画：让对象抖动/摇晃指定的次数",
    aliases: ["抖动", "摆动", "摇晃", "震动"],
    keywords: ["wiggle", "shake"],
  },
  visual_python_manim_apply_wave_animation: {
    purpose: "播放波浪动画：让对象像水波一样起伏抖动",
    aliases: ["波浪", "水波"],
    keywords: ["wave"],
  },
  visual_python_manim_show_passing_flash_animation: {
    purpose: "播放流光动画：一道亮光扫过对象",
    aliases: ["流光", "扫光", "闪光扫过"],
    keywords: ["flash", "passing"],
  },

  // 动态绑定
  visual_python_manim_value_tracker: {
    purpose: "创建数值追踪器：一个会随时间变化的数值，可驱动数字显示或图形动画",
    aliases: ["数字变化", "数值变化", "计数器", "数值动画", "数字追踪", "追踪器"],
    keywords: ["value", "tracker", "变化", "实时"],
    recommendedFor: ["数字变化", "实时数值"],
    relatedBlocks: ["visual_python_manim_decimal_follow_tracker", "visual_python_manim_tracker_set_value_animation", "visual_python_manim_variable"],
  },
  visual_python_manim_decimal_number: {
    purpose: "创建数字显示对象：显示一个数值（固定小数位数）",
    aliases: ["数字显示", "数字对象"],
    keywords: ["decimal", "小数"],
    recommendedFor: ["显示数字"],
  },
  visual_python_manim_decimal_follow_tracker: {
    purpose: "创建跟随追踪器的数字显示：把追踪器数值实时显示为小数",
    aliases: ["数字显示", "实时数字", "数字动画", "数字跳动"],
    keywords: ["decimal", "实时数字"],
    recommendedFor: ["数字变化动画"],
    relatedBlocks: ["visual_python_manim_value_tracker"],
  },
  visual_python_manim_tracker_set_value_animation: {
    purpose: "播放追踪器动画：让追踪器的值从当前值平滑变化到目标值",
    aliases: ["数值变化动画", "数字增加动画", "数值动画", "数字增长"],
    keywords: ["tracker", "increase"],
    recommendedFor: ["数字从…变化到…"],
    relatedBlocks: ["visual_python_manim_value_tracker", "visual_python_manim_play"],
  },
  visual_python_manim_tracker_get_value: {
    purpose: "读取追踪器当前保存的数值",
    aliases: ["读取数值", "取值"],
    keywords: ["tracker value"],
  },
  visual_python_manim_always_redraw: {
    purpose: "让对象每一帧重新绘制，实时跟随数值变化",
    aliases: ["实时重绘", "动态刷新"],
    keywords: ["redraw", "每帧"],
  },
  visual_python_manim_traced_path: {
    purpose: "为运动中的对象绘制轨迹路径",
    aliases: ["轨迹", "路径", "运动轨迹"],
    keywords: ["traced path"],
    recommendedFor: ["运动轨迹"],
  },
  visual_python_manim_variable: {
    purpose: "创建一个带标签的变量对象，可显示名称和值",
    aliases: ["变量", "标签变量"],
    keywords: ["variable", "标签"],
  },
  visual_python_manim_follow_target_updater: {
    purpose: "让对象持续跟随另一个对象（跟随更新器）",
    aliases: ["跟随", "尾随"],
    keywords: ["follow", "持续跟随"],
  },

  // 属性与样式
  visual_python_manim_set_color: {
    purpose: "设置对象颜色（立即生效，不带动画）",
    aliases: ["颜色", "变色", "设置颜色"],
    keywords: ["color"],
    avoidFor: ["颜色变化动画"],
  },
  visual_python_manim_set_opacity: {
    purpose: "设置对象的不透明度（半透明效果）",
    aliases: ["透明度", "半透明", "变透明"],
    keywords: ["opacity", "alpha"],
  },
  visual_python_manim_set_fill: {
    purpose: "设置对象的填充颜色与不透明度",
    aliases: ["填充", "填充颜色"],
    keywords: ["fill"],
  },
  visual_python_manim_set_stroke: {
    purpose: "设置对象的描边颜色、线宽与不透明度",
    aliases: ["描边", "边框", "线宽"],
    keywords: ["stroke", "轮廓"],
  },
  visual_python_manim_move_to: {
    purpose: "把对象移动到指定位置（立即生效，不带动画）",
    aliases: ["移动到", "定位"],
    keywords: ["move to", "位置"],
    avoidFor: ["移动动画"],
  },
  visual_python_manim_shift: {
    purpose: "把对象按方向相对移动一段距离（立即生效，不带动画）",
    aliases: ["相对移动", "偏移"],
    keywords: ["shift", "平移"],
    avoidFor: ["移动动画"],
  },
  visual_python_manim_rotate: {
    purpose: "旋转对象指定角度（立即生效，不带动画）",
    aliases: ["旋转", "转动"],
    keywords: ["rotate", "角度"],
    avoidFor: ["旋转动画"],
  },
  visual_python_manim_scale: {
    purpose: "缩放对象指定倍数（立即生效，不带动画）",
    aliases: ["缩放", "放大", "缩小"],
    keywords: ["scale", "倍数"],
    avoidFor: ["缩放动画"],
  },
  visual_python_manim_arrange: {
    purpose: "把多个对象沿指定方向排列并设置间距",
    aliases: ["排列", "对齐", "摊开"],
    keywords: ["arrange", "间距"],
  },

  // 坐标与数学工具
  visual_python_manim_function_preset: {
    purpose: "创建常用函数表达式（一次函数、二次函数、正弦函数等），可连接到绘制函数",
    aliases: ["函数", "一次函数", "二次函数", "正弦函数", "余弦函数", "正弦"],
    keywords: ["lambda", "函数表达式"],
    recommendedFor: ["函数图像", "数学函数"],
  },
  visual_python_manim_math_constant: {
    purpose: "取数学常量（圆周率 π、自然常数 e 等）",
    aliases: ["圆周率", "π", "pi", "自然常数"],
    keywords: ["constant", "数学常量"],
  },
  visual_python_manim_degrees: {
    purpose: "表示一个角度值（单位为度）",
    aliases: ["角度", "度数", "度"],
    keywords: ["degrees"],
  },
  visual_python_manim_point: {
    purpose: "创建一个坐标点（横坐标、纵坐标、深度坐标）",
    aliases: ["坐标点", "点坐标", "位置"],
    keywords: ["point", "xyz"],
  },
  visual_python_manim_direction_constant: {
    purpose: "取方向常量（上、下、左、右等标准方向）",
    aliases: ["方向", "上下左右", "标准方向"],
    keywords: ["direction"],
  },
  visual_python_manim_color_constant: {
    purpose: "取颜色常量（标准颜色名称）",
    aliases: ["颜色值", "颜色常量"],
    keywords: ["color constant"],
  },
  visual_python_manim_range: {
    purpose: "生成一个带步长的数值范围（用于坐标范围或循环）",
    aliases: ["数值范围", "区间", "范围"],
    keywords: ["range", "步长"],
  },
  visual_python_manim_dimensions: {
    purpose: "创建三维尺寸向量（宽、高、深）",
    aliases: ["尺寸", "宽高深"],
    keywords: ["dimensions"],
  },
};

const familyPurpose: Array<[string, string]> = [
  ["动态绑定", "绑定数值或对象的实时更新逻辑"],
  ["动画效果", "播放或构造动画效果"],
  ["场景与流程", "组织场景、播放与资源流程"],
  ["属性与样式", "修改对象的样式或位置"],
  ["列表与批量结构", "批量组织对象或动画"],
  ["坐标与数学工具", "提供坐标、数值或函数"],
  ["对象", "创建或操作场景对象"],
  ["常用", "创建场景、对象或播放动画"],
];

const familyRules: Array<{ segment: string; metadata: PluginBlockAgentMetadata }> = [
  { segment: "场景与流程", metadata: { capabilities: ["scene-control"], intentTags: ["scene", "flow"] } },
  { segment: "播放控制", metadata: { keywords: ["播放控制", "动画编排"] } },
  { segment: "配音", metadata: { keywords: ["旁白", "语音", "配音"], recommendedFor: ["讲解视频", "配音旁白"], intentTags: ["voiceover", "audio"] } },
  { segment: "音频", metadata: { keywords: ["音乐", "音效", "背景音乐"], intentTags: ["audio"] } },
  { segment: "对象管理", metadata: { keywords: ["场景内对象"] } },
  { segment: "三维相机", metadata: { keywords: ["镜头", "视角", "相机"], intentTags: ["3d", "camera"] } },
  { segment: "文本与公式", metadata: { keywords: ["文字", "公式"], recommendedFor: ["文字", "公式"], intentTags: ["text", "formula"] } },
  { segment: "基础几何", metadata: { keywords: ["几何图形", "平面图形"], recommendedFor: ["几何图形"], intentTags: ["geometry", "shape"] } },
  { segment: "线条与箭头", metadata: { keywords: ["线条", "箭头", "连线"], intentTags: ["geometry", "line", "arrow"] } },
  { segment: "坐标对象", metadata: { keywords: ["坐标轴", "网格"], recommendedFor: ["坐标系"], intentTags: ["axes", "coordinate"] } },
  { segment: "坐标方法", metadata: { keywords: ["函数图像", "曲线"], recommendedFor: ["函数图像", "坐标系绘图"], intentTags: ["axes", "plot", "function"] } },
  { segment: "表格与矩阵", metadata: { keywords: ["数据", "表格"], intentTags: ["table", "matrix", "data"] } },
  { segment: "标注与装饰", metadata: { keywords: ["标注", "装饰"], intentTags: ["annotation"] } },
  { segment: "三维对象", metadata: { keywords: ["立体图形", "3d"], recommendedFor: ["3D 展示", "立体图形"], intentTags: ["3d", "geometry"] } },
  { segment: "复用与组合", metadata: { keywords: ["组合", "成组", "整体"], intentTags: ["group"] } },
  { segment: "创建 / 消失", metadata: { keywords: ["出现", "消失", "绘制"], intentTags: ["animation", "appear"] } },
  { segment: "淡入淡出", metadata: { keywords: ["渐显", "渐隐", "消失"], intentTags: ["animation", "fade"] } },
  { segment: "变换动画", metadata: { keywords: ["变形", "转换", "变成"], intentTags: ["animation", "transform"] } },
  { segment: "属性动画", metadata: { keywords: ["移动", "旋转", "缩放", "颜色"], intentTags: ["animation", "property"] } },
  { segment: "生长动画", metadata: { keywords: ["生长", "出现"], intentTags: ["animation", "grow"] } },
  { segment: "强调动画", metadata: { keywords: ["强调", "高亮", "突出"], recommendedFor: ["强调重点"], intentTags: ["animation", "emphasis"] } },
  { segment: "样式设置", metadata: { keywords: ["颜色", "透明度", "填充", "描边"], intentTags: ["style", "color"], capabilities: ["modify-style"] } },
  { segment: "位置变换", metadata: { keywords: ["移动", "排列", "定位"], intentTags: ["position", "transform"], capabilities: ["modify-position"] } },
  { segment: "动态绑定", metadata: { keywords: ["实时", "追踪", "更新", "变化"], recommendedFor: ["数值变化", "动态更新"], intentTags: ["dynamic", "tracker", "updater"] } },
  { segment: "列表与批量结构", metadata: { keywords: ["批量", "列表"], intentTags: ["batch", "list"] } },
];

const mergeMetadata = (base: PluginBlockAgentMetadata, extra: PluginBlockAgentMetadata): PluginBlockAgentMetadata => {
  const merged: PluginBlockAgentMetadata = { ...base, ...extra };
  for (const key of ["aliases", "keywords", "examples", "capabilities", "dependencies", "requires", "relatedBlocks", "recommendedFor", "avoidFor", "intentTags"] as const) {
    const values = [...(base[key] ?? []), ...(extra[key] ?? [])];
    if (values.length) merged[key] = [...new Set(values)];
  }
  if (base.inputDescriptions || extra.inputDescriptions) merged.inputDescriptions = { ...base.inputDescriptions, ...extra.inputDescriptions };
  if (base.inputTypes || extra.inputTypes) merged.inputTypes = { ...base.inputTypes, ...extra.inputTypes };
  return merged;
};

const familyMetadata = (path: string[]): PluginBlockAgentMetadata =>
  familyRules.filter((rule) => path.includes(rule.segment)).reduce((metadata, rule) => mergeMetadata(metadata, rule.metadata), {} as PluginBlockAgentMetadata);

export function manimBlockAgentMetadata(type: string, categoryPath: string[], label: string): PluginBlockAgentMetadata | undefined {
  if (!type.startsWith("visual_python_manim_")) return undefined;
  const family = familyMetadata(categoryPath);
  const purpose = curated[type]?.purpose
    ?? `${familyPurpose.find(([segment]) => categoryPath.includes(segment))?.[1] ?? "创建或配置 Manim 动画元素"}：${label || type.replace(/^visual_python_manim_/, "").replaceAll("_", " ")}`;
  const base: PluginBlockAgentMetadata = { purpose, ...family };
  return curated[type] ? mergeMetadata(base, curated[type]) : base;
}
