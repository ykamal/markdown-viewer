import { element } from "./dom";
import { onSetting, saveSetting } from "./settings";

const steps = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const label = element("#zoom-level");

let zoom = Number(localStorage.getItem("zoom")) || 1;

function apply(value: number) {
  zoom = value;
  document.documentElement.style.setProperty("--zoom", String(zoom));
  label.textContent = `${Math.round(zoom * 100)}%`;
}

function set(value: number) {
  apply(value);
  saveSetting("zoom", String(value));
}

export function zoomIn() {
  set(steps.find((step) => step > zoom) ?? zoom);
}

export function zoomOut() {
  set(steps.findLast((step) => step < zoom) ?? zoom);
}

export function resetZoom() {
  set(1);
}

onSetting("zoom", (value) => apply(Number(value) || 1));
apply(zoom);
