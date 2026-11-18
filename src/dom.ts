export function element(selector: string) {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`Missing element ${selector}`);
  return found;
}
