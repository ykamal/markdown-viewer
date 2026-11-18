import { invoke } from "@tauri-apps/api/core";
import { render } from "./render";

export interface Doc {
  path: string;
  scroller: HTMLElement;
  body: HTMLElement;
}

export function createDoc(path: string): Doc {
  const scroller = document.createElement("div");
  scroller.className = "doc";
  const body = document.createElement("article");
  body.className = "markdown-body";
  scroller.append(body);
  return { path, scroller, body };
}

export async function loadDoc(doc: Doc) {
  const source = await invoke<string>("read_file", { path: doc.path });
  doc.body.replaceChildren(render(source));
}
