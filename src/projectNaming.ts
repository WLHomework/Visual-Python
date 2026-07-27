const windowsReservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export const projectFileBaseName = (value: string) => value.replace(/\.vpy$/i, "");

export const normalizeProjectFileName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160 || /[<>:"/\\|?*\u0000-\u001f]/.test(trimmed)) return null;
  const name = /\.vpy$/i.test(trimmed) ? trimmed : `${trimmed}.vpy`;
  const baseName = projectFileBaseName(name).replace(/[. ]+$/g, "");
  if (!baseName || windowsReservedNames.test(baseName)) return null;
  return `${baseName}.vpy`;
};
