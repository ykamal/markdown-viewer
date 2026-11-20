import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import lightCss from "github-markdown-css/github-markdown-light.css?inline";
import darkCss from "github-markdown-css/github-markdown-dark.css?inline";
import codeLightCss from "highlight.js/styles/github.css?inline";
import codeDarkCss from "highlight.js/styles/github-dark.css?inline";
import { onSetting, saveSetting } from "./settings";

const modes = ["system", "light", "dark"] as const;
type Mode = (typeof modes)[number];
const labels: Record<Mode, string> = { system: "Match System", light: "Light", dark: "Dark" };

const media = matchMedia("(prefers-color-scheme: dark)");
const style = document.createElement("style");
document.head.append(style);

let mode = parse(localStorage.getItem("theme"));
let dark: boolean | undefined;
let changed = () => {};

function parse(value: string | null): Mode {
  return modes.find((m) => m === value) ?? "system";
}

function apply() {
  const next = mode === "dark" || (mode === "system" && media.matches);
  document.querySelector("[data-action=theme]")?.setAttribute("title", `Appearance: ${labels[mode]}`);
  if (next === dark) return;
  dark = next;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  style.textContent = dark
    ? `${darkCss}${codeDarkCss}@media print{${lightCss}${codeLightCss}}`
    : lightCss + codeLightCss;
  changed();
}

function setMode(next: Mode) {
  mode = next;
  getCurrentWindow().setTheme(mode === "system" ? null : mode);
  apply();
}

export function isDark() {
  return dark === true;
}

export function onThemeChange(callback: () => void) {
  changed = callback;
}

export function setTheme(value: string) {
  setMode(parse(value));
  saveSetting("theme", mode);
}

export async function showThemeMenu() {
  const menu = await Menu.new({
    items: modes.map((m) => ({ text: labels[m], checked: m === mode, action: () => setTheme(m) })),
  });
  await menu.popup();
}

media.addEventListener("change", apply);
onSetting("theme", (value) => {
  if (value !== mode) setMode(parse(value));
});
setMode(mode);
