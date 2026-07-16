export const extractManimSceneNames = (source: string) => [...source.matchAll(/class\s+([A-Za-z_]\w*)\s*\(\s*(?:Scene|MovingCameraScene|ThreeDScene|SpecialThreeDScene)\s*\)/g)]
  .map((match) => match[1])
  .filter((name, index, names) => names.indexOf(name) === index);

export const nextUniqueManimSceneName = (baseName: string, usedNames: Iterable<string>) => {
  const used = new Set(usedNames);
  if (!used.has(baseName)) return baseName;
  const numberedName = baseName.match(/^(.*?)(\d+)$/);
  const nameRoot = numberedName?.[1] || baseName;
  let suffix = numberedName ? Number(numberedName[2]) + 1 : 2;
  while (used.has(`${nameRoot}${suffix}`)) suffix += 1;
  return `${nameRoot}${suffix}`;
};
