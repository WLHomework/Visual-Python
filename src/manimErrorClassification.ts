const latexFailurePattern = /(?:\b(?:latex|pdflatex|xelatex|lualatex|miktex|dvisvgm|mathtex|tex|texerror|textemplate)\b|tex_file_writing|tex_to_svg_file)/i;

export function isManimLatexFailure(traceback: string): boolean {
  return latexFailurePattern.test(traceback);
}
