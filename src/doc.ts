import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { enhance } from "./enhance";
import { render } from "./render";
import { dirname, isMarkdown, resolvePath } from "./paths";

export interface Doc {
  path: string;
  source: string;
  loading: boolean;
  scroller: HTMLElement;
  body: HTMLElement;
}

const hasScheme = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

export function createDoc(path: string, openMarkdown: (path: string) => void): Doc {
  const scroller = document.createElement("div");
  scroller.className = "doc";
  const body = document.createElement("article");
  body.className = "markdown-body";
  scroller.append(body);

  body.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href") ?? "";

    if (href.startsWith("#")) {
      body.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)?.scrollIntoView();
    } else if (/^(https?|mailto):/i.test(href)) {
      openUrl(href);
    } else if (!hasScheme.test(href)) {
      const target = resolvePath(dirname(path), href.split("#")[0]);
      if (isMarkdown(target)) openMarkdown(target);
      else revealItemInDir(target);
    }
  });

  return { path, source: "", loading: true, scroller, body };
}

export async function loadDoc(doc: Doc) {
  try {
    doc.source = await invoke<string>("read_file", { path: doc.path });
    await renderDoc(doc);
  } finally {
    doc.loading = false;
  }
}

export async function renderDoc(doc: Doc) {
  doc.body.replaceChildren(render(doc.source));
  localizeImages(doc);
  await enhance(doc.body);
}

function localizeImages(doc: Doc) {
  const dir = dirname(doc.path);
  const local = (url: string) => convertFileSrc(resolvePath(dir, url));

  for (const img of doc.body.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (src && !hasScheme.test(src)) img.src = local(src);
  }
  for (const source of doc.body.querySelectorAll("source[srcset]")) {
    const [url, ...rest] = (source.getAttribute("srcset") ?? "").trim().split(/\s+/);
    if (url && !hasScheme.test(url)) source.setAttribute("srcset", [local(url), ...rest].join(" "));
  }
}
