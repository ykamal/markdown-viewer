import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { closeFind, findNext, openFind, updateFind } from "./find";
import { showRecent } from "./recent";
import {
  closeActive,
  cycleTabs,
  onActiveChange,
  openTab,
  reloadActive,
  reloadPath,
  rerenderAll,
  type OpenRequest,
} from "./tabs";
import { cycleTheme, onThemeChange, setTheme } from "./theme";
import { toggleToc, updateToc } from "./toc";
import { checkForUpdates, dismissUpdate, installUpdate } from "./updater";
import { resetZoom, zoomIn, zoomOut } from "./zoom";

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

const actions: Record<string, () => void> = {
  open: pickFiles,
  "close-tab": closeActive,
  reload: reloadActive,
  toc: toggleToc,
  find: openFind,
  "find-next": () => findNext(1),
  "find-prev": () => findNext(-1),
  "find-close": closeFind,
  "next-tab": () => cycleTabs(1),
  "prev-tab": () => cycleTabs(-1),
  theme: cycleTheme,
  "theme-system": () => setTheme("system"),
  "theme-light": () => setTheme("light"),
  "theme-dark": () => setTheme("dark"),
  "zoom-in": zoomIn,
  "zoom-out": zoomOut,
  "zoom-reset": resetZoom,
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

getCurrentWebview().onDragDropEvent((event) => {
  if (event.payload.type === "drop") openPaths(event.payload.paths);
});

await listen<string>("menu", ({ payload }) => actions[payload]?.());
await listen<string>("file-changed", ({ payload }) => reloadPath(payload));
await listen<OpenRequest[]>("open-files", ({ payload }) => payload.forEach(openTab));
await showRecent((path) => openPaths([path]));
const pending = await invoke<OpenRequest[]>("window_ready");
pending.forEach(openTab);
