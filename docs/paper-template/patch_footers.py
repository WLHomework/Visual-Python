# -*- coding: utf-8 -*-
"""页码后处理：
1) 解析 document.xml 各节 sectPr 的 footerReference 与 pgNumType；
2) 罗马节页脚 PAGE 域补 \\* ROMAN，正文节补 \\* arabic（WPS 兼容）；
3) 删除空 <w:pgNumType/>。
用法：python patch_footers.py <docx路径>
"""
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

def main(path_str):
    src = Path(path_str)
    tmpdir = Path(tempfile.mkdtemp())
    with zipfile.ZipFile(src) as z:
        z.extractall(tmpdir)

    doc = (tmpdir / "word" / "document.xml").read_text(encoding="utf-8")
    rels = (tmpdir / "word" / "_rels" / "document.xml.rels").read_text(encoding="utf-8")
    rid_to_target = dict(re.findall(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

    # 按出现顺序取每个 sectPr 的 default footerReference 与 pgNumType
    plan = []  # (footer_file, fmt)
    for sect in re.findall(r"<w:sectPr[ >].*?</w:sectPr>", doc, flags=re.S):
        m_ref = re.search(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"', sect) or \
                re.search(r'<w:footerReference[^>]*r:id="([^"]+)"[^>]*w:type="default"', sect)
        m_fmt = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', sect)
        if m_ref:
            target = rid_to_target.get(m_ref.group(1), "")
            fmt = m_fmt.group(1) if m_fmt else "decimal"
            plan.append((target.split("/")[-1], fmt))

    print("footer plan:", plan)
    patched = []
    for footer_file, fmt in plan:
        fp = tmpdir / "word" / footer_file
        if not fp.exists():
            continue
        switch = "ROMAN" if fmt == "upperRoman" else "arabic"
        xml = fp.read_text(encoding="utf-8")
        new_xml, n = re.subn(
            r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
            r"\1 PAGE \\* " + switch + r" \\* MERGEFORMAT \2",
            xml,
        )
        if n:
            fp.write_text(new_xml, encoding="utf-8")
            patched.append((footer_file, switch, n))

    # 删除空 pgNumType（封面节遗留）
    doc2, removed = re.subn(r"<w:pgNumType/>", "", doc)
    if removed:
        (tmpdir / "word" / "document.xml").write_text(doc2, encoding="utf-8")

    out = src
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(tmpdir.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(tmpdir).as_posix())
    shutil.rmtree(tmpdir)
    print("patched:", patched, "| empty pgNumType removed:", removed)

if __name__ == "__main__":
    main(sys.argv[1])
