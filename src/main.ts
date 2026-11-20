import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { element } from "./dom";
import { closeFind, findNext, openFind, updateFind } from "./find";
import { showRecent } from "./recent";
import {
  clearDropTarget,
  closeActive,
  cycleTabs,
  hasTabs,
  onActiveChange,
  openTab,
  reloadActive,
  reloadPath,
  rerenderAll,
  showDropTarget,
  type OpenRequest,
} from "./tabs";
import { onThemeChange, setTheme, showThemeMenu } from "./theme";
import { searchToc, toggleToc, updateToc } from "./toc";
import { checkForUpdates, dismissUpdate, installUpdate } from "./updater";
import { resetZoom, zoomIn, zoomOut } from "./zoom";
import { closeViewer, isViewerOpen, viewerReset, viewerZoomIn, viewerZoomOut } from "./zoomable";

const mac = navigator.userAgent.includes("Mac");
const appWindow = getCurrentWindow();
const dropOverlay = element("#drop-overlay");
document.documentElement.classList.toggle("mac", mac);
element("#open-shortcut").textContent = mac ? "⌘O" : "Ctrl+O";
getVersion().then((version) => (element("#app-version").textContent = `Version ${version}`));

function openPaths(paths: string[]) {
  for (const path of paths) openTab({ path, scroll: 0 });
}

async function pickFiles() {
  const picked = await open({
    multiple: true,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mkdn"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  openPaths(picked ?? []);
}

function print() {
  if (!hasTabs()) return;
  if (mac) invoke("print_page");
  else window.print();
}

const actions: Record<string, () => void> = {
  open: pickFiles,
  print,
  "close-tab": closeActive,
  reload: reloadActive,
  toc: () => toggleToc(),
  "toc-search": searchToc,
  find: openFind,
  "find-next": () => findNext(1),
  "find-prev": () => findNext(-1),
  "find-close": closeFind,
  "next-tab": () => cycleTabs(1),
  "prev-tab": () => cycleTabs(-1),
  theme: showThemeMenu,
  "theme-system": () => setTheme("system"),
  "theme-light": () => setTheme("light"),
  "theme-dark": () => setTheme("dark"),
  "zoom-in": () => (isViewerOpen() ? viewerZoomIn() : zoomIn()),
  "zoom-out": () => (isViewerOpen() ? viewerZoomOut() : zoomOut()),
  "zoom-reset": () => (isViewerOpen() ? viewerReset() : resetZoom()),
  "viewer-reset": viewerReset,
  "viewer-close": closeViewer,
  "check-updates": () => checkForUpdates(true),
  "update-install": installUpdate,
  "update-dismiss": dismissUpdate,
};

for (const button of document.querySelectorAll<HTMLElement>("[data-action]")) {
  button.addEventListener("click", () => actions[button.dataset.action ?? ""]?.());
}

onThemeChange(rerenderAll);
onActiveChange((doc) => {
  updateToc(doc);
  updateFind(doc);
});

getCurrentWebview().onDragDropEvent(({ payload }) => {
  dropOverlay.hidden = payload.type !== "enter" && payload.type !== "over";
  if (payload.type === "drop") openPaths(payload.paths);
});

document.addEventListener("contextmenu", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".markdown-body, input")) event.preventDefault();
});

async function trackFullscreen() {
  document.documentElement.classList.toggle("fullscreen", await appWindow.isFullscreen());
}
if (mac) {
  window.addEventListener("resize", trackFullscreen);
  trackFullscreen();
}

await listen<string>("menu", ({ payload }) => actions[payload]?.());
await listen<string>("file-changed", ({ payload }) => reloadPath(payload));
await listen<number>("tab-drag-over", ({ payload }) => showDropTarget(payload));
await listen("tab-drag-leave", clearDropTarget);
await listen<OpenRequest[]>("open-files", ({ payload }) => payload.forEach(openTab));
await showRecent((path) => openPaths([path]));
const pending = await invoke<OpenRequest[]>("window_ready");
pending.forEach(openTab);
