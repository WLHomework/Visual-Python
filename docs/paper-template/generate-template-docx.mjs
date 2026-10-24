// 生成《学术论文通用模板.docx》——按 GB/T 7713.2—2022 学位论文式结构。
// 运行：node generate-template-docx.mjs（在 docs/paper-template 目录下）
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, SectionType, TableOfContents,
  PageBreak, FootnoteReferenceRun, Math as DMath, MathRun, MathFraction,
  MathSubScript as DMathSubScript,
} from "docx";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "学术论文通用模板.docx");

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };
const F_BODY = { ascii: "Times New Roman", eastAsia: "SimSun" };
const F_HEI = { ascii: "Times New Roman", eastAsia: "SimHei" };

const safeText = (v, ph) => (v === undefined || v === null || v === "" || String(v) === "NaN" || String(v) === "undefined" ? (ph || "【待填写】") : String(v));

// ---------- 通用构件 ----------
const body = (children, opts = {}) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  indent: { firstLine: 480 },
  spacing: { line: 360 },
  children,
  ...opts,
});
const t = (text, o = {}) => new TextRun({ text, size: 24, font: F_BODY, color: "000000", ...o });
const hei = (text, o = {}) => new TextRun({ text, size: 24, font: F_HEI, color: "000000", ...o });
// 文献上标引用（顺序编码制）
const cite = (label) => new TextRun({ text: label, superScript: true, size: 18, font: F_BODY, color: "000000" });

const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true, size: 32, font: F_HEI, color: "000000" })] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true, size: 30, font: F_HEI, color: "000000" })] });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true, size: 28, font: F_HEI, color: "000000" })] });

// 图占位框（灰色提示文字 + 四周边框，图题另起置于下方）
const figurePlaceholder = (hint) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 240, after: 120, line: 360 },
  border: {
    top: { style: BorderStyle.SINGLE, size: 4, color: "9AA6B2" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "9AA6B2" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "9AA6B2" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "9AA6B2" },
  },
  children: [new TextRun({ text: hint, size: 21, color: "808080", font: F_BODY })],
});
const figureCaption = (text) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 60, after: 240, line: 360 },
  children: [new TextRun({ text, size: 21, font: F_BODY, color: "000000" })],
});
const tableCaption = (text) => new Paragraph({
  keepNext: true,
  alignment: AlignmentType.CENTER,
  spacing: { before: 240, after: 120, line: 360 },
  children: [new TextRun({ text, size: 21, font: F_BODY, color: "000000" })],
});

// 三线表
const threeLineTable = (header, rows, widths) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
    left: NB, right: NB, insideHorizontal: NB, insideVertical: NB,
  },
  rows: [
    new TableRow({
      tableHeader: true, cantSplit: true,
      children: header.map((text, i) => new TableCell({
        width: { size: widths[i], type: WidthType.PERCENTAGE },
        borders: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" }, top: NB, left: NB, right: NB },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        shading: { type: ShadingType.CLEAR, fill: "FFFFFF" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 300 }, children: [new TextRun({ text, bold: true, size: 21, font: F_BODY, color: "000000" })] })],
      })),
    }),
    ...rows.map((cells) => new TableRow({
      cantSplit: true,
      children: cells.map((text, i) => new TableCell({
        width: { size: widths[i], type: WidthType.PERCENTAGE },
        borders: { top: NB, bottom: NB, left: NB, right: NB },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 300 }, children: [new TextRun({ text: safeText(text, "【】"), size: 21, font: F_BODY, color: "000000" })] })],
      })),
    })),
  ],
});

// 公式段：公式居中、编号右对齐（tabStop 方案，学术场景规范）
const formula = (mathChildren, number) => new Paragraph({
  spacing: { before: 120, after: 120, line: 360 },
  tabStops: [
    { type: "center", position: 4394 },
    { type: "right", position: 8788 },
  ],
  children: [
    new TextRun({ text: "\t", size: 24, font: F_BODY }),
    new DMath({ children: mathChildren }),
    new TextRun({ text: "\t" + number, size: 24, font: F_BODY, color: "000000" }),
  ],
});
const mr = (text) => new MathRun(text);

// 页眉页脚
const buildHeader = (title) => new Header({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" } },
    children: [new TextRun({ text: title, size: 18, color: "333333", font: F_BODY })],
  })],
});
const buildPageNumberFooter = () => new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: "- ", size: 21, font: F_BODY }),
      new TextRun({ children: [PageNumber.CURRENT], size: 21, font: { ascii: "Times New Roman" } }),
      new TextRun({ text: " -", size: 21, font: F_BODY }),
    ],
  })],
});

// ---------- 封面（本节内无页码） ----------
const THESIS_TITLE = "面向复杂问题求解的混合方法研究：设计、实现与评估";
const THESIS_TITLE_EN = "A Hybrid Method for Complex Problem Solving: Design, Implementation, and Evaluation";

const buildAcademicCover = () => {
  const infoRows = [
    ["学　　院", "【学院名称】"],
    ["专　　业", "【专业名称】"],
    ["作　　者", "【作者姓名】"],
    ["学　　号", "【学号】"],
    ["指导教师", "【导师姓名】 教授"],
  ];
  const infoTable = new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: allNoBorders,
    rows: infoRows.map(([label, value]) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" }, top: NB, left: NB, right: NB },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: label + ":", size: 28, font: F_HEI, color: "000000" })] })],
        }),
        new TableCell({
          width: { size: 65, type: WidthType.PERCENTAGE },
          borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" }, top: NB, left: NB, right: NB },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, size: 28, font: F_BODY, color: "000000" })] })],
        }),
      ],
    })),
  });
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 400, line: Math.ceil(22 * 23), lineRule: "atLeast" }, children: [new TextRun({ text: "【大学名称】", size: 44, bold: true, font: F_HEI, color: "000000" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800, line: Math.ceil(18 * 23), lineRule: "atLeast" }, children: [new TextRun({ text: "硕士学位论文（结构示例）", size: 36, font: F_HEI, color: "000000" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200, line: Math.ceil(18 * 23), lineRule: "atLeast" }, children: [new TextRun({ text: THESIS_TITLE, size: 36, bold: true, font: F_HEI, color: "000000" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1200, line: Math.ceil(16 * 23), lineRule: "atLeast" }, children: [new TextRun({ text: THESIS_TITLE_EN, size: 32, font: { ascii: "Times New Roman", eastAsia: "SimSun" }, color: "000000" })] }),
    infoTable,
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, line: Math.ceil(14 * 23), lineRule: "atLeast" }, children: [new TextRun({ text: "2026年10月", size: 28, font: F_BODY, color: "000000" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [new TextRun({ text: "（本页为封面示例：期刊投稿版删除本页，题目、作者信息移至正文首页）", size: 21, color: "808080", font: F_BODY })] }),
  ];
};

// ---------- 前置部分 ----------
const frontMatter = [
  // 中文摘要
  h1("摘　要"),
  body([t("随着【领域背景】的快速发展，【具体问题】已成为制约【应用场景】发展的关键瓶颈。针对现有方法在【具体局限】方面的不足，本文提出一种【方法名称】，通过【核心思路一】与【核心思路二】的有机结合，实现对【研究对象】的有效求解。")]),
  body([t("在方法层面，首先构建了【理论模型／系统框架】，界定核心概念并形成分析框架；其次，设计了【算法／流程／教学设计】并完成系统实现；最后，设计了包含定量与定性两条证据链的评估方案。在实证层面，于【实验环境／真实场景】中招募【样本来源】开展对照实验，并辅以问卷、访谈与行为数据分析。")]),
  body([t("结果表明：所提方法在【指标一】上达到【结果一】，较基线方法提升【结果二】（统计学意义与效应量以真实数据为准，禁止虚构）；定性分析进一步显示【定性发现】。研究结果可为【理论领域】提供方法参考，为【实践领域】提供工具与流程支持。", {})]),
  new Paragraph({
    spacing: { before: 240, line: 360 },
    children: [
      hei("关键词：", { size: 24 }),
      t("【关键词一】；【关键词二】；【关键词三】；【关键词四】；【关键词五】（3～8 个，分号分隔）"),
      new PageBreak(),
    ],
  }),
  // 英文摘要
  h1("Abstract"),
  body([new TextRun({ text: "With the rapid development of [research domain], [specific problem] has become a critical bottleneck limiting [application scenario]. To address the limitations of existing approaches in [specific weakness], this thesis proposes a [method name] that integrates [key idea 1] with [key idea 2]. ", size: 24, font: { ascii: "Times New Roman", eastAsia: "SimSun" }, color: "000000" })]),
  body([new TextRun({ text: "A [theoretical model / system framework] is first constructed; an [algorithm / workflow / instructional design] is then designed and implemented; finally, an evaluation combining quantitative and qualitative evidence is conducted in [experimental environment / real-world setting] with [sample description]. ", size: 24, font: { ascii: "Times New Roman", eastAsia: "SimSun" }, color: "000000" })]),
  body([new TextRun({ text: "Results show that the proposed method achieves [result 1] on [metric 1] and outperforms baseline methods by [result 2]; qualitative analysis further indicates [qualitative finding]. The findings provide methodological references for [theory] and practical support for [practice].", size: 24, font: { ascii: "Times New Roman", eastAsia: "SimSun" }, color: "000000" })]),
  new Paragraph({
    spacing: { before: 240, line: 360 },
    children: [
      new TextRun({ text: "Key words: ", bold: true, size: 24, font: { ascii: "Times New Roman" }, color: "000000" }),
      new TextRun({ text: "keyword 1; keyword 2; keyword 3; keyword 4; keyword 5", size: 24, font: { ascii: "Times New Roman" }, color: "000000" }),
      new PageBreak(),
    ],
  }),
  // 目录
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360, line: 360 },
    children: [new TextRun({ text: "目　录", bold: true, size: 32, font: F_HEI, color: "000000" })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({ text: "注：本目录由域代码自动生成。正文修改后请在目录上点击右键并选择\u201c更新域\u201d以刷新页码；期刊投稿版删除本页。", italics: true, size: 18, color: "888888", font: F_BODY }), new PageBreak()],
  }),
  // 插图与附表清单
  h1("插图与附表清单"),
  body([t("插图清单（图幅不少于 3 幅时建议列出；页码以域目录为准，期刊投稿版删除本页）：", { size: 21 })], { indent: {} }),
  ...["图 3-1　研究总体框架", "图 4-1　【定量结果曲线图题】", "图 4-2　【定性分析主题网络图题】"].map((s) => new Paragraph({ indent: { left: 480 }, spacing: { line: 360 }, children: [t(s, { size: 21 })] })),
  body([t("附表清单：", { size: 21 })], { indent: {} }),
  ...["表 2-1　相关概念对比", "表 3-1　样本基本构成", "表 4-1　实验环境配置", "表 4-2　实验结果对比"].map((s, i, arr) => new Paragraph({
    indent: { left: 480 }, spacing: { line: 360 },
    children: [t(s, { size: 21 }), ...(i === arr.length - 1 ? [new PageBreak()] : [])],
  })),
  // 符号和缩略词说明
  h1("符号和缩略词说明"),
  tableCaption("（正文首次出现缩略词或符号时仍须给出全称，本表起速查作用）"),
  threeLineTable(
    ["缩略词／符号", "英文全称", "中文释义"],
    [
      ["RQ", "Research Question", "研究问题"],
      ["H", "Hypothesis", "研究假设"],
      ["M / SD", "Mean / Standard Deviation", "均值／标准差"],
      ["TP / TN / FP / FN", "True/False Positive/Negative", "真阳性等混淆矩阵量（见式(3-1)）"],
      ["【符号】", "【Full name】", "【释义】"],
    ],
    [24, 40, 36],
  ),
  new Paragraph({ spacing: { before: 120 }, children: [t("（学位论文通用前置项；期刊投稿版通常并入首页脚注或删除本页。）", { size: 18, color: "808080", italics: true })] }),
];

// ---------- 正文 ----------
const mainContent = [
  // 第一章
  h1("第一章　绪论"),
  h2("1.1　研究背景与意义"),
  body([
    t("近年来，【宏观背景一】与【宏观背景二】的交汇重塑了【研究领域】的格局，【具体现象】日益凸显"),
    cite("[1-3]"),
    t("。已有研究从【视角一】与【视角二】两方面展开探索，文献[1]较早提出【代表性论断】，但整体上仍缺乏针对【细分问题】的系统解决方案。"),
    new FootnoteReferenceRun(1),
  ]),
  body([t("在理论层面，本研究有助于【理论贡献】；在实践层面，可为【应用对象】提供【实践价值】。", {})]),
  body([new TextRun({ text: "（期刊投稿版：首页脚注注明收稿日期、基金项目与作者简介；学位论文版删除脚注，基金项目写入致谢。）", size: 18, color: "808080", italics: true, font: F_BODY }), new FootnoteReferenceRun(2)], { indent: {} }),
  h2("1.2　国内外研究现状"),
  h3("1.2.1　国外研究现状"),
  body([t("国外相关研究可归纳为两条主线。其一，【主线一】聚焦【问题形态】，代表性工作构建了【方法／模型】，在【场景】中验证了其有效性"), cite("[4]"), t("；其二，【主线二】从【另一视角】出发，强调【机理】，代表性成果包括【工作】"), cite("[5]"), t("。总体上，前者长于【优点一】而弱于【缺点一】，后者相反。")]),
  h3("1.2.2　国内研究现状"),
  body([t("国内研究起步于【起点工作】，近年来在【方向】上进展显著"), cite("[6]"), t("，形成了【特点】的研究传统，但在【空白点】方面仍待深入。")]),
  h3("1.2.3　研究现状述评"),
  body([t("综上，已有研究的贡献集中体现为【贡献一】【贡献二】两点；不足则在于：其一，【不足一】；其二，【不足二】。二者构成本研究的切入点。")]),
  h2("1.3　研究内容与创新点"),
  body([t("围绕上述缺口，本文的研究内容包括三个方面：（1）【研究内容一】；（2）【研究内容二】；（3）【研究内容三】。对应地，本文的创新点为：（1）【理论／方法创新】；（2）【技术／设计创新】；（3）【实证／应用创新】。")]),
  h2("1.4　论文组织结构"),
  body([t("本文共六章。第一章绪论；第二章界定核心概念并梳理理论基础（见第 2.1 节）；第三章阐述研究设计，总体框架如图 3-1 所示；第四章报告结果与分析；第五章讨论主要发现并分析有效性威胁（见第 5.3 节）；第六章总结全文。附录 A 给出数据采集工具，附录 B 为论文格式自查清单。")]),

  // 第二章
  h1("第二章　相关理论与技术基础"),
  h2("2.1　核心概念界定"),
  body([t("本文涉及的核心概念及其相互关系如表 2-1 所示。")]),
  tableCaption("表 2-1　相关概念对比"),
  threeLineTable(
    ["概念", "提出者／来源", "核心内涵", "与本研究的关系"],
    [
      ["概念 A", "【文献】", "【定义】", "【关系】"],
      ["概念 B", "【文献】", "【定义】", "【关系】"],
      ["概念 C", "【文献】", "【定义】", "【关系】"],
    ],
    [14, 20, 36, 30],
  ),
  body([t("如表 2-1 所示，概念 A 与概念 B 在【维度】上存在本质差异，本文在【界定】意义上使用概念 A。学术论文的编写规范遵循国家标准 GB/T 7713.2—2022"), cite("[7]"), t("。")]),
  h2("2.2　理论基础"),
  body([t("本研究以【理论一】与【理论二】为理论基础。【理论一】由【提出者】提出，核心命题为【命题】，已被广泛应用于【领域】"), cite("[8]"), t("；【理论二】强调【命题二】，为本研究【假设 H1／H2】的推导提供依据。")]),
  h2("2.3　关键技术与工具"),
  body([t("研究过程使用【技术／平台／工具】实现【用途】，选型依据为【理由】"), cite("[9]"), t("。关键技术与第三章研究框架中各环节的对应关系见第 3.1 节。")]),

  // 第三章
  h1("第三章　研究设计"),
  h2("3.1　总体研究框架"),
  body([t("本研究构建\u201c输入—过程—输出\u201d三层研究框架，总体结构如图 3-1 所示。")]),
  figurePlaceholder("【图 3-1 插图位置：研究总体框架图（建议矢量图，或不低于 300 dpi 位图）】"),
  figureCaption("图 3-1　研究总体框架"),
  body([t("如图 3-1 所示，框架底层为【数据层／对象层】，负责【职能】；中层为【方法层／过程层】，实现【职能】；顶层为【评价层／结果层】，通过【评价方式】检验研究问题。")]),
  h2("3.2　研究问题与假设"),
  body([hei("RQ1：", { bold: true }), t("【研究问题一】？")]),
  body([hei("RQ2：", { bold: true }), t("【研究问题二】？")]),
  body([hei("RQ3：", { bold: true }), t("【研究问题三】？")]),
  body([t("基于第 2.2 节的理论分析，提出研究假设：H1：【假设内容一】；H2：【假设内容二】。研究问题与假设的回应情况见第 4.4 节与第 5.1 节。")]),
  h2("3.3　研究方法与过程"),
  body([t("定量部分采用【实验／准实验／对照试验】设计，以【指标】衡量【构念】，如式(3-1)所示：")]),
  formula([
    mr("Accuracy = "),
    new MathFraction({ numerator: [mr("TP + TN")], denominator: [mr("TP + TN + FP + FN")] }),
  ], "(3-1)"),
  body([t("其中 TP、TN、FP、FN 分别表示真阳性、真阴性、假阳性与假阴性（各符号首次出现处均已定义，亦可查符号表）。为消除量纲影响，各原始指标按式(3-2)归一化后参与统计检验：")]),
  formula([
    mr("S = "),
    new MathFraction({
      numerator: [mr("x \u2212 "), new DMathSubScript({ children: [mr("x")], subScript: [mr("min")] })],
      denominator: [new DMathSubScript({ children: [mr("x")], subScript: [mr("max")] }), mr(" \u2212 "), new DMathSubScript({ children: [mr("x")], subScript: [mr("min")] })],
    }),
    mr(" \u00d7 100%"),
  ], "(3-2)"),
  body([t("式(3-2)中 x 为观测值，min 与 max 分别为该指标在样本中的最小值与最大值。定性部分采用【半结构化访谈／课堂观察／个案分析】，编码流程遵循【方法】，工具见附录 A。")]),
  h2("3.4　样本与数据来源"),
  body([t("研究样本来自【抽样范围与方式】，共【N】例（样本数据支持材料引用公开数据集时按文献[10]著录）。研究经【伦理审查机构】审批，所有被试签署知情同意书，数据经匿名化处理后分析。样本基本构成见表 3-1。")]),
  tableCaption("表 3-1　样本基本构成"),
  threeLineTable(
    ["组别", "样本量", "【属性一】", "【属性二】", "数据来源"],
    [
      ["实验组", "【N1】", "【】", "【】", "【】"],
      ["对照组", "【N2】", "【】", "【】", "【】"],
    ],
    [16, 16, 22, 22, 24],
  ),
  body([t("如表 3-1 所示，两组在【关键属性】上匹配良好，满足对照设计的基本要求。")]),

  // 第四章
  h1("第四章　结果与分析"),
  h2("4.1　实验环境与设置"),
  body([t("实验环境与关键参数配置如表 4-1 所示，全部材料与代码可通过【仓库地址】复现。")]),
  tableCaption("表 4-1　实验环境配置"),
  threeLineTable(
    ["类别", "配置项", "规格／版本"],
    [
      ["硬件", "【CPU／内存／GPU】", "【】"],
      ["软件", "【操作系统／工具链】", "【】"],
      ["参数", "【关键参数】", "【】"],
    ],
    [18, 42, 40],
  ),
  h2("4.2　定量结果分析"),
  body([t("描述统计与推断统计结果汇总于表 4-2。统计报告采用规范句式：实验组得分（M =【均值】, SD =【标准差】）高于对照组（M =【均值】, SD =【标准差】），差异具有统计学意义（t(【df】) =【t 值】, p =【p 值】, d =【效应量】）；显著性结论必须以真实数据为准，禁止虚构或选择性报告。")]),
  tableCaption("表 4-2　实验结果对比"),
  threeLineTable(
    ["指标", "实验组", "对照组", "统计量", "p 值", "效应量 d"],
    [
      ["【指标一】", "【】", "【】", "【】", "【】", "【】"],
      ["【指标二】", "【】", "【】", "【】", "【】", "【】"],
      ["【指标三】", "【】", "【】", "【】", "【】", "【】"],
    ],
    [22, 15, 15, 18, 15, 15],
  ),
  body([t("如表 4-2 所示，【指标一】与【指标二】呈现一致方向的变化。各指标随【自变量／轮次】的变化趋势如图 4-1 所示。")]),
  figurePlaceholder("【图 4-1 插图位置：定量结果曲线／柱状图（误差线、坐标轴单位须完整）】"),
  figureCaption("图 4-1　【定量结果曲线图题】"),
  h2("4.3　定性结果分析"),
  body([t("对访谈与观察资料进行三级编码，共提炼出【n】个主题，主题间关系如图 4-2 所示。典型被试引述须标注来源编号（如 S03：\u201c【原话】\u201d）。")]),
  figurePlaceholder("【图 4-2 插图位置：定性主题网络图／流程截图】"),
  figureCaption("图 4-2　【定性分析主题网络图题】"),
  h2("4.4　综合讨论"),
  body([t("针对第 3.2 节提出的研究问题：就 RQ1 而言，【证据 → 发现 → 结论】；就 RQ2 而言，【证据链】；就 RQ3 而言，【证据链】。假设 H1、H2 的验证情况汇总于【表／段落】。")]),

  // 第五章
  h1("第五章　讨论"),
  h2("5.1　主要发现"),
  body([t("本研究获得三项主要发现：其一，【发现一】；其二，【发现二】；其三，【发现三】。三者分别回应 RQ1—RQ3，并支持假设 H1（H2 的支持情况为【结论】）。")]),
  h2("5.2　与已有研究的比较"),
  body([t("与文献[2]相比，本文的【结论】与其在【方面】一致，印证了【规律】；与文献[5]的分歧可能源于【情境／方法差异】，提示【边界条件】。")]),
  h2("5.3　有效性威胁"),
  body([t("内部效度方面，【样本选择、成熟效应、测验工具等威胁及控制措施】；外部效度方面，结论适用于【范围】，向【其他情境】推广需谨慎；构念效度方面，【测量工具的适配性】；结论效度方面，【统计检验力、多重比较的处理】。")]),

  // 第六章
  h1("第六章　结论与展望"),
  h2("6.1　研究结论"),
  body([t("本文针对【问题】，提出了【方法】，并经【评估】得出：结论一【针对 RQ1】；结论二【针对 RQ2】；结论三【针对 RQ3】。")]),
  h2("6.2　主要贡献"),
  body([t("理论层面，【贡献】；方法层面，【贡献】；实践层面，【贡献】。表述保持克制，不夸大适用范围。")]),
  h2("6.3　研究局限与未来工作"),
  body([t("本研究存在以下局限：【样本、方法、周期等局限】。未来工作将围绕【方向一】【方向二】【方向三】展开。", {})]),
  new Paragraph({ spacing: { before: 200 }, children: [t("（正文至此结束，以下为后置部分：致谢、声明、参考文献与附录。）", { size: 18, color: "808080", italics: true })], indent: {} }),

  // 致谢
  h1("致　谢"),
  body([t("感谢【基金名称及编号】的资助；感谢【导师／团队】的指导；感谢所有参与研究的被试与协助人员。（学位论文中基金项目在此注明；期刊版致谢置于参考文献之后、声明之前，以刊社要求为准。）")], { indent: { firstLine: 480 } }),

  // 声明
  h1("声　明"),
  body([hei("伦理声明：", { bold: true }), t("本研究经【伦理审查委员会名称】审查批准（批号：【编号】），所有被试均签署知情同意书。")]),
  body([hei("利益冲突：", { bold: true }), t("全体作者声明不存在利益冲突。")]),
  body([hei("数据可用性：", { bold: true }), t("支持本文结论的数据与代码可从【仓库地址】获取。")]),
  body([hei("基金资助：", { bold: true }), t("【基金名称及编号】。")]),
  body([hei("人工智能使用披露：", { bold: true }), t("本文【写作／分析】过程中使用了【工具名称】辅助【具体用途】；作者已核查全部生成内容并对文责负责。（2024 年以来多数期刊要求强制披露。）")]),

  // 参考文献
  h1("参考文献"),
  body([new TextRun({ text: "（以下为 GB/T 7714 各文献类型的著录格式示例，条目内容为占位文字，撰写时请替换为真实文献并保持与正文引用序号一一对应；顺序编码制按正文首次引用顺序排列。GB/T 7714—2025 已于 2026-07-01 实施，新增预印本、数据论文等类型，投稿时以目标期刊指定版本为准。）", size: 18, color: "808080", italics: true, font: F_BODY })], { indent: {} }),
  ...[
    "[1] 【作者一, 作者二, 作者三, 等】.【期刊论文题名】[J].【刊名】,【年份】,【卷】(【期】):【起止页码】.",
    "[2] 【作者】.【专著书名】[M].【版次，第 1 版不著录】.【出版地】:【出版社】,【年份】:【引用页码】.",
    "[3] 【作者】.【学位论文题名】[D].【城市】:【学校】,【年份】.",
    "[4] 【作者】.【会议论文题名】[C]//【会议录名称】.【出版地】:【出版社】,【年份】:【页码】.",
    "[5] 【专利申请人】.【专利名称】:【专利号】[P].【公告日期】.",
    "[6] 全国信息与文献标准化技术委员会. 信息与文献 参考文献著录规则: GB/T 7714—2015 [S]. 北京: 中国标准出版社, 2015.",
    "[7] 全国信息与文献标准化技术委员会. 学术论文编写规则: GB/T 7713.2—2022 [S]. 北京: 中国标准出版社, 2022.",
    "[8] 【机构／作者】.【报告题名】[R].【出版地】:【机构】,【年份】.",
    "[9] 【作者】.【软件名称】:【版本号】[CP].【出版地】:【出版者】,【年份】.",
    "[10] 【作者】.【数据集名称】[DS/OL]. (【发布日期】)[【引用日期】].【DOI 或 URL】.",
  ].map((s) => new Paragraph({
    indent: { left: 420, hanging: 420 },
    spacing: { line: 360 },
    children: [new TextRun({ text: s, size: 21, font: F_BODY, color: "000000" })],
  })),

  // 附录 A
  h1("附录 A　数据采集工具"),
  body([t("与第 3.4 节对应，本附录包含【问卷题项／访谈提纲／评分细则】。问卷采用【李克特五点量表】，维度与题项示例如下：Q1【题干】；Q2【题干】；Q3【题干】。访谈提纲围绕【主题】设置【n】个主问题与若干追问。")]),

  // 附录 B
  h1("附录 B　论文格式自查清单"),
  tableCaption("表 B-1　投稿前逐项核对（完成后将状态列替换为\u201c已核\u201d）"),
  threeLineTable(
    ["检查项", "要求", "状态"],
    [
      ["题名", "不超过 25 字，附英文题名", "【　】"],
      ["摘要", "五要素齐全，第三人称，200～300 字", "【　】"],
      ["关键词", "3～8 个，中英文一一对应", "【　】"],
      ["章节编号", "单一体系不混用、不跳级", "【　】"],
      ["图", "图题在图下方，编号连续，正文均有引用", "【　】"],
      ["表", "表题在表上方，三线表，正文均有引用", "【　】"],
      ["公式", "居中排、编号右置，符号首次出现即定义", "【　】"],
      ["文献交叉引用", "正文 [n] 与文后条目一一对应，同源同号", "【　】"],
      ["脚注", "收稿日期、基金、作者简介（期刊版）", "【　】"],
      ["目录", "域生成且已\u201c更新域\u201d刷新页码", "【　】"],
      ["声明", "伦理、利益冲突、数据可用性、AI 使用披露", "【　】"],
      ["量与单位", "采用 SI 单位，符合 GB 3100～3102", "【　】"],
      ["数字用法", "符合 GB/T 15835", "【　】"],
      ["术语一致", "同一概念全文同名，首现附英文原文", "【　】"],
      ["中图分类号等", "按目标期刊要求补充分类号、DOI、ORCID", "【　】"],
    ],
    [22, 60, 18],
  ),
];

// ---------- 文档组装 ----------
const PAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1440, bottom: 1440, left: 1701, right: 1417, header: 850, footer: 992 },
};

const doc = new Document({
  creator: "Visual Python Template Generator",
  title: THESIS_TITLE,
  styles: {
    default: {
      document: {
        run: { font: F_BODY, size: 24, color: "000000" },
        paragraph: { spacing: { line: 360 } },
      },
      heading1: {
        run: { font: F_HEI, size: 32, bold: true, color: "000000" },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360, line: 360 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: F_HEI, size: 30, bold: true, color: "000000" },
        paragraph: { spacing: { before: 360, after: 240, line: 360 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: F_HEI, size: 28, bold: true, color: "000000" },
        paragraph: { spacing: { before: 240, after: 120, line: 360 }, outlineLevel: 2 },
      },
    },
  },
  footnotes: {
    1: {
      children: [new Paragraph({
        spacing: { line: 300 },
        children: [new TextRun({ text: "收稿日期：【YYYY-MM-DD】；基金项目：【基金名称】（【编号】）资助。（期刊论文首页脚注示例；学位论文版删除本脚注，基金项目移至致谢。）", size: 18, font: F_BODY, color: "000000" })],
      })],
    },
    2: {
      children: [new Paragraph({
        spacing: { line: 300 },
        children: [new TextRun({ text: "作者简介：【姓名】（【出生年】—），【性别】，【籍贯】，【职称／学位】，研究方向为【研究方向】，ORCID：【编号】；通信作者：【姓名】，E-mail：【邮箱】。", size: 18, font: F_BODY, color: "000000" })],
      })],
    },
  },
  sections: [
    // 第 1 节：封面（无页码、无页眉页脚）
    {
      properties: { page: { size: PAGE.size, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildAcademicCover(),
    },
    // 第 2 节：前置部分（摘要、Abstract、目录、图表清单、符号表）—— 罗马页码
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: PAGE.size, margin: PAGE.margin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: buildHeader(THESIS_TITLE) },
      footers: { default: buildPageNumberFooter() },
      children: frontMatter,
    },
    // 第 3 节：正文及后置部分 —— 阿拉伯页码从 1 起
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: PAGE.size, margin: PAGE.margin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: buildHeader(THESIS_TITLE) },
      footers: { default: buildPageNumberFooter() },
      children: mainContent,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("OK ->", OUT, buf.length, "bytes");
});
