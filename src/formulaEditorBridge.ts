export type FormulaEditorRequest = {
  id: number;
  value: string;
  commit(value: string): void;
};

type FormulaEditorListener = (request: FormulaEditorRequest) => void;

const listeners = new Set<FormulaEditorListener>();
let nextRequestId = 1;

export const requestFormulaEdit = (value: string, commit: (value: string) => void) => {
  const request: FormulaEditorRequest = { id: nextRequestId++, value, commit };
  for (const listener of listeners) listener(request);
};

export const subscribeFormulaEditor = (listener: FormulaEditorListener) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
