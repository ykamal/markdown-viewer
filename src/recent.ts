import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { element } from "./dom";
import { basename, dirname } from "./paths";

const section = element("#recent");
const list = element("#recent-list");

export async function showRecent(open: (path: string) => void) {
  const render = (paths: string[]) => {
    section.hidden = !paths.length;
    list.replaceChildren(
      ...paths.map((path) => {
        const button = document.createElement("button");
        const name = document.createElement("span");
        const dir = document.createElement("span");
        name.textContent = basename(path);
        dir.textContent = dirname(path);
        dir.className = "recent-dir";
        button.title = path;
        button.append(name, dir);
        button.addEventListener("click", () => open(path));
        const item = document.createElement("li");
        item.append(button);
        return item;
      }),
    );
  };

  render(await invoke<string[]>("recent_files"));
  await listen<string[]>("recent-changed", ({ payload }) => render(payload));
}
