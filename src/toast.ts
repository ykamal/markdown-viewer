import { element } from "./dom";

const toast = element("#toast");
const text = element("#toast-text");
let timer = 0;

export function showToast(message: string) {
  text.textContent = message;
  toast.hidden = true;
  void toast.offsetWidth;
  toast.hidden = false;
  clearTimeout(timer);
  timer = window.setTimeout(hideToast, 5000);
}

export function hideToast() {
  clearTimeout(timer);
  toast.hidden = true;
}

element("#toast-close").addEventListener("click", hideToast);
