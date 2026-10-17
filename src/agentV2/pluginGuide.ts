// 官方《插件开发指南》（docs/plugin-development/README.md）的读取入口。
// 契约里只放小节目录；正文按需分页读取，避免把整篇指南塞进上下文。
import guideSource from "../../docs/plugin-development/README.md?raw";

export type PluginGuideSection = {
  title: string;
  level: number;
  start: number;
  end: number;
};

const parseGuideSections = (source: string): PluginGuideSection[] => {
  const sections: PluginGuideSection[] = [];
  for (const match of source.matchAll(/^(#{2,3}) (.+?)\s*$/gm)) {
    if (match.index === undefined) continue;
    sections.push({ title: match[2], level: match[1].length, start: match.index, end: source.length });
  }
  for (let index = 0; index < sections.length - 1; index += 1) {
    sections[index].end = sections[index + 1].start;
  }
  return sections;
};

export const pluginGuideSections = parseGuideSections(guideSource);
export const pluginGuideTopLevelTitles = pluginGuideSections.filter((section) => section.level === 2).map((section) => section.title);
export const pluginGuideTableOfContents = pluginGuideSections.map((section) => `${"#".repeat(section.level)} ${section.title}`);

export type PluginGuidePage = {
  found: boolean;
  section: string | null;
  content: string;
  offset: number;
  totalChars: number;
  truncated: boolean;
  nextOffset?: number;
  available: string[];
};

const pageSize = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) ? Math.max(200, Math.min(8_000, value)) : fallback;

export function readPluginGuide(input: { section?: string; offset?: number; maxChars?: number } = {}): PluginGuidePage {
  const query = input.section?.trim();
  if (!query) {
    const content = pluginGuideTableOfContents.join("\n");
    return { found: true, section: null, content, offset: 0, totalChars: content.length, truncated: false, available: pluginGuideTableOfContents };
  }
  const match =
    pluginGuideSections.find((section) => section.title === query) ||
    pluginGuideSections.find((section) => section.title.includes(query)) ||
    pluginGuideSections.find((section) => query.includes(section.title));
  if (!match) {
    return { found: false, section: null, content: "", offset: 0, totalChars: 0, truncated: false, available: pluginGuideTableOfContents };
  }
  const body = guideSource.slice(match.start, match.end).trimEnd();
  const offset = typeof input.offset === "number" && Number.isInteger(input.offset) ? Math.max(0, input.offset) : 0;
  const page = body.slice(offset, offset + pageSize(input.maxChars, 4_000));
  const nextOffset = offset + page.length;
  const truncated = nextOffset < body.length;
  return {
    found: true,
    section: match.title,
    content: page,
    offset,
    totalChars: body.length,
    truncated,
    ...(truncated ? { nextOffset } : {}),
    available: [],
  };
}
