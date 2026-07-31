# Visual Python Education Paper Implementation Plan

> **For agentic workers:** Inline execution is being used because the user explicitly requested that drafting begin in the current session.

**Goal:** Produce three citation-traceable Chinese education research papers about generative-AI-assisted graphical programming based on the self-developed Visual Python platform, with figures, tables, case practice, and Word deliverables.

**Architecture:** Draft one full Markdown manuscript first, then create independently edited medium and short versions that preserve the same argument chain and citation numbering. Reuse project screenshots as evidence figures, keep classroom claims qualitative unless measured data exists, and convert each Markdown manuscript to DOCX with Pandoc.

**Tech Stack:** Markdown, Pandoc, project PNG assets, Crossref-verified DOI references.

---

### Task 1: Prepare traceable source and figure assets

**Files:**
- Create: `docs/papers/assets/`
- Reference: `docs/manim-plugin/assets/examples/*.png`
- Reference: `docs/manim-plugin/assets/blocks/*.png`

- [x] Select DOI-verifiable education research and official Python/Blockly/Manim documentation.
- [x] Select existing project screenshots for platform and output figures.

### Task 2: Draft the full manuscript

**Files:**
- Create: `docs/papers/visual-python-ai-graphical-programming-full.md`

- [ ] Include title, placeholder author/unit, abstract, keywords, hierarchical body, figures, tables, case practice, conclusion, and numbered references.
- [ ] Use Pandoc superscript citation markers such as `^1^` and ensure every marker maps to the reference list.
- [ ] State that Visual Python is self-developed and avoid fabricated quantitative classroom results.

### Task 3: Derive the medium and short manuscripts

**Files:**
- Create: `docs/papers/visual-python-ai-graphical-programming-medium.md`
- Create: `docs/papers/visual-python-ai-graphical-programming-short.md`

- [ ] Preserve the same title, research problem, case, conclusions, and citation numbering.
- [ ] Reduce theory and platform detail progressively while retaining the complete case chain.

### Task 4: Build Word deliverables

**Files:**
- Create: `docs/papers/Visual Python生成式人工智能辅助图形化编程教学研究-完整版.docx`
- Create: `docs/papers/Visual Python生成式人工智能辅助图形化编程教学研究-中篇版.docx`
- Create: `docs/papers/Visual Python生成式人工智能辅助图形化编程教学研究-短篇版.docx`

- [ ] Copy referenced PNG assets into `docs/papers/assets/`.
- [ ] Run Pandoc for all three manuscripts with embedded figures.
- [ ] Verify all three outputs exist and contain the expected headings, tables, figures, superscript citations, and references.

### Task 5: Quality checks

- [ ] Check citation coverage and reference numbering.
- [ ] Check heading hierarchy and figure/table numbering.
- [ ] Check approximate Chinese character ranges and report any limitation honestly.

