export type PluginGeneratedPythonSample = {
  blockType: string;
  code: string;
};

export async function validatePluginGeneratedPython(
  samples: PluginGeneratedPythonSample[],
  validateCode: (code: string) => Promise<void>,
) {
  for (const sample of samples) {
    if (sample.code.includes("\t")) {
      throw new Error(`积木 ${sample.blockType} 生成的 Python 包含 Tab；请统一使用 4 个空格缩进`);
    }
    const invalidIndent = sample.code.split("\n").find((line) => {
      if (!line.trim()) return false;
      const leadingSpaces = line.match(/^ */)?.[0].length || 0;
      return leadingSpaces % 4 !== 0;
    });
    if (invalidIndent !== undefined) {
      throw new Error(`积木 ${sample.blockType} 生成的 Python 缩进不是 4 个空格的倍数`);
    }
    try {
      await validateCode(sample.code);
    } catch (error) {
      throw new Error(`积木 ${sample.blockType} 生成的 Python 存在语法或缩进错误：${String(error)}`);
    }
  }
}
