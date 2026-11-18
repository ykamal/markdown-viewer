export function element(selector: string): HTMLElement;
export function element<T extends HTMLElement>(selector: string, type: new () => T): T;
export function element(selector: string, type: new () => HTMLElement = HTMLElement) {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Missing element ${selector}`);
  return found;
}
