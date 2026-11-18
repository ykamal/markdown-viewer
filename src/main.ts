import "github-markdown-css/github-markdown.css";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { createDoc, loadDoc, type Doc } from "./doc";
import { basename } from "./paths";

const docs = document.querySelector<HTMLElement>("#docs");
const start = document.querySelector<HTMLElement>("#start");
let current: Doc | undefined;

async function openFile(path: string) {
  if (!docs || !start) return;
  const doc = createDoc(path);
  try {
    await loadDoc(doc);
  } catch (error) {
    doc.body.textContent = `Couldn't open ${path}: ${error}`;
  }
  current?.scroller.remove();
  current = doc;
  docs.append(doc.scroller);
  start.hidden = true;
  getCurrentWindow().setTitle(basename(path));
}

async function pickFiles() {
  const picked = await open({
    multiple: true,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mkdn"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  for (const path of picked ?? []) await openFile(path);
}

for (const button of document.querySelectorAll("[data-action=open]")) {
  button.addEventListener("click", pickFiles);
}

getCurrentWebview().onDragDropEvent(async (event) => {
  if (event.payload.type !== "drop") return;
  for (const path of event.payload.paths) await openFile(path);
});
