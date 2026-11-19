import type { PanzoomObject } from "@panzoom/panzoom";
import { element } from "./dom";

type Zoomable = HTMLElement | SVGElement;

const icons = {
  out: '<path d="M6 12h12" />',
  in: '<path d="M12 6v12M6 12h12" />',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />',
  full: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />',
};
const titles = { out: "Zoom out", in: "Zoom in", reset: "Reset", full: "Full screen" };

const viewer = element("#viewer");
const stage = element("#viewer-stage");
let viewerZoom: PanzoomObject | undefined;
let library: Promise<typeof import("@panzoom/panzoom").default> | undefined;

function load() {
  library ??= import("@panzoom/panzoom").then((module) => module.default);
  return library;
}

function controls(actions: Array<[keyof typeof icons, () => void]>) {
  const bar = document.createElement("div");
  bar.className = "zoom-controls";
  for (const [name, action] of actions) {
    const button = document.createElement("button");
    button.className = "icon";
    button.title = titles[name];
    button.innerHTML = `<svg viewBox="0 0 24 24">${icons[name]}</svg>`;
    button.addEventListener("click", action);
    bar.append(button);
  }
  return bar;
}

function setup(frame: HTMLElement, content: Element | null) {
  if (!(content instanceof HTMLElement || content instanceof SVGElement)) return;
  frame.classList.add("zoomable");

  let instance: Promise<PanzoomObject> | undefined;
  const get = () => {
    instance ??= load().then((Panzoom) =>
      Panzoom(content, { minScale: 0.5, maxScale: 8, step: 0.25, panOnlyWhenZoomed: true, cursor: "default" }),
    );
    return instance;
  };

  frame.addEventListener("pointerenter", get, { once: true });
  frame.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      get().then((zoom) => zoom.zoomWithWheel(event));
    },
    { passive: false },
  );
  frame.append(
    controls([
      ["out", () => get().then((zoom) => zoom.zoomOut())],
      ["in", () => get().then((zoom) => zoom.zoomIn())],
      ["reset", () => get().then((zoom) => zoom.reset())],
      ["full", () => openViewer(content)],
    ]),
  );
}

export function makeZoomable(body: HTMLElement) {
  for (const frame of body.querySelectorAll<HTMLElement>("pre.mermaid, .math[data-display='true']")) {
    setup(frame, frame.firstElementChild);
  }
  for (const img of body.querySelectorAll("img")) {
    if (img.closest("a")) continue;
    const wrap = () => {
      if (img.naturalWidth < 200 && img.naturalHeight < 200) return;
      const frame = document.createElement("span");
      frame.className = "zoom-image";
      img.replaceWith(frame);
      frame.append(img);
      setup(frame, img);
    };
    if (img.complete) wrap();
    else img.addEventListener("load", wrap, { once: true });
  }
}

async function openViewer(source: Zoomable) {
  const clone = source.cloneNode(true);
  if (!(clone instanceof HTMLElement || clone instanceof SVGElement)) return;
  clone.removeAttribute("style");
  if (clone instanceof SVGSVGElement) {
    clone.setAttribute("width", "100%");
    clone.setAttribute("height", "100%");
  }
  stage.replaceChildren(clone);
  viewer.hidden = false;
  const Panzoom = await load();
  viewerZoom = Panzoom(clone, { minScale: 0.2, maxScale: 20, step: 0.3, cursor: "grab" });
}

export function isViewerOpen() {
  return !viewer.hidden;
}

export function closeViewer() {
  viewerZoom?.destroy();
  viewerZoom = undefined;
  stage.replaceChildren();
  viewer.hidden = true;
}

export function viewerZoomIn() {
  viewerZoom?.zoomIn();
}

export function viewerZoomOut() {
  viewerZoom?.zoomOut();
}

export function viewerReset() {
  viewerZoom?.reset();
}

stage.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    viewerZoom?.zoomWithWheel(event);
  },
  { passive: false },
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isViewerOpen()) closeViewer();
});
