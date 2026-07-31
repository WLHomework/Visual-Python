export const pythonIdentifierSource = String.raw`[_\p{ID_Start}][_\p{ID_Continue}]*`;

const pythonIdentifierPattern = new RegExp(`^${pythonIdentifierSource}$`, "u");
const dottedIdentifierSource = `${pythonIdentifierSource}(?:\\.${pythonIdentifierSource})*`;
const pythonAnnotationPattern = new RegExp(
  `^${dottedIdentifierSource}(?:\\[(?:${dottedIdentifierSource}|[0-9]+|[., |\\[\\]\\s])+\\])?(?:\\s*\\|\\s*${dottedIdentifierSource})*$`,
  "u",
);

export const pythonKeywords = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
  "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

export const normalizePythonIdentifier = (value: unknown) => String(value || "").trim().normalize("NFKC");

export const isPythonIdentifier = (value: string) => {
  const normalized = normalizePythonIdentifier(value);
  return pythonIdentifierPattern.test(normalized) && !pythonKeywords.has(normalized);
};

export const isDottedPythonIdentifier = (value: string) => {
  const normalized = normalizePythonIdentifier(value);
  return Boolean(normalized) && normalized.split(".").every(isPythonIdentifier);
};

export const isPythonAnnotation = (value: string) => pythonAnnotationPattern.test(String(value || "").trim().normalize("NFKC"));

export const pythonIdentifierOrFallback = (value: unknown, fallback: string) => {
  const normalized = normalizePythonIdentifier(value);
  return isDottedPythonIdentifier(normalized) ? normalized : fallback;
};

export const sanitizePythonIdentifier = (value: unknown, fallback: string, numericPrefix = "obj_") => {
  const normalized = normalizePythonIdentifier(value);
  if (isPythonIdentifier(normalized)) return normalized;
  const characters = [...normalized];
  const cleaned = characters.map((character, index) => {
    const pattern = index === 0 ? /^[_\p{ID_Start}]$/u : /^[_\p{ID_Continue}]$/u;
    return pattern.test(character) ? character : "_";
  }).join("").replace(/_+/g, "_").replace(/^_+$/, "");
  const prefixed = cleaned && /^[_\p{ID_Start}]/u.test(cleaned) ? cleaned : `${numericPrefix}${cleaned}`;
  return isPythonIdentifier(prefixed) ? prefixed : fallback;
};
