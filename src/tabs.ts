import { invoke } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { createDoc, loadDoc, renderDoc, type Doc } from "./doc";
import { element } from "./dom";
import { basename } from "./paths";

export interface OpenRequest {
  path: string;
  scroll: number;
}

interface Tab {
  doc: Doc;
  el: HTMLElement;
}

const strip = element("#tabs");
const docs = element("#docs");
const start = element("#start");
const appWindow = getCurrentWindow();
const tabs: Tab[] = [];
let active: Tab | undefined;
let changed: (doc?: Doc) => void = () => {};
let dropIndex: number | undefined;
const marker = document.createElement("div");
marker.className = "drop-marker";

export function onActiveChange(callback: (doc?: Doc) => void) {
  changed = callback;
}

export async function openTab({ path, scroll }: OpenRequest) {
  const existing = tabs.find((tab) => tab.doc.path === path);
  if (existing) return activate(existing);

  const doc = createDoc(path, (target) => openTab({ path: target, scroll: 0 }));
  const tab: Tab = { doc, el: document.createElement("div") };
  setupTab(tab);
  const at = dropIndex ?? tabs.length;
  strip.insertBefore(tab.el, tabs[at]?.el ?? null);
  tabs.splice(at, 0, tab);
  docs.append(doc.scroller);
  activate(tab);
  invoke("watch", { path }).catch(() => {});
  if (await refresh(tab, true)) invoke("add_recent", { path });
  doc.scroller.scrollTop = scroll;
}

export function showDropTarget(x: number) {
  dropIndex = indexAt(x);
  strip.classList.add("drop-target");
  strip.insertBefore(marker, tabs[dropIndex]?.el ?? null);
}

export function clearDropTarget() {
  dropIndex = undefined;
  strip.classList.remove("drop-target");
  marker.remove();
}

function indexAt(x: number, skip?: Tab) {
  const others = tabs.filter((t) => t !== skip);
  const index = others.findIndex((t) => {
    const rect = t.el.getBoundingClientRect();
    return x < rect.left + rect.width / 2;
  });
  return index < 0 ? others.length : index;
}

export function reloadPath(path: string) {
  const tab = tabs.find((t) => t.doc.path === path);
  if (tab) refresh(tab, true);
}

export function reloadActive() {
  if (active) refresh(active, true);
}

export function rerenderAll() {
  for (const tab of tabs) refresh(tab, false);
}

export function closeActive() {
  if (active) closeTab(active);
  else appWindow.close();
}

export function cycleTabs(step: number) {
  if (!active || tabs.length < 2) return;
  activate(tabs[(tabs.indexOf(active) + step + tabs.length) % tabs.length]);
}

async function refresh(tab: Tab, read: boolean) {
  const { scroller } = tab.doc;
  const top = scroller.scrollTop;
  try {
    if (read) await loadDoc(tab.doc);
    else await renderDoc(tab.doc);
    return true;
  } catch (error) {
    tab.doc.body.textContent = `Couldn't open ${tab.doc.path}: ${error}`;
    return false;
  } finally {
    scroller.scrollTop = top;
    if (tab === active) changed(tab.doc);
  }
}

function activate(tab: Tab) {
  active?.el.classList.remove("active");
  active?.doc.scroller.classList.remove("active");
  active = tab;
  tab.el.classList.add("active");
  tab.doc.scroller.classList.add("active");
  tab.el.scrollIntoView({ block: "nearest", inline: "nearest" });
  start.hidden = true;
  appWindow.setTitle(basename(tab.doc.path));
  changed(tab.doc);
}

function closeTab(tab: Tab) {
  const index = tabs.indexOf(tab);
  tabs.splice(index, 1);
  tab.el.remove();
  tab.doc.scroller.remove();
  invoke("unwatch", { path: tab.doc.path });
  if (tab !== active) return;

  active = undefined;
  const next = tabs[Math.min(index, tabs.length - 1)];
  if (next) {
    activate(next);
  } else {
    start.hidden = false;
    appWindow.setTitle("Readme Viewer");
    changed();
  }
}

function request(tab: Tab): OpenRequest {
  return { path: tab.doc.path, scroll: tab.doc.scroller.scrollTop };
}

async function moveToNewWindow(tab: Tab) {
  await invoke("new_window", { files: [request(tab)] });
  closeTab(tab);
}

async function showMenu(tab: Tab) {
  const others = tabs.filter((t) => t !== tab);
  const menu = await Menu.new({
    items: [
      { text: "Move to New Window", enabled: others.length > 0, action: () => moveToNewWindow(tab) },
      { item: "Separator" },
      { text: "Close Tab", action: () => closeTab(tab) },
      { text: "Close Other Tabs", enabled: others.length > 0, action: () => others.forEach(closeTab) },
      { item: "Separator" },
      { text: "Show in Folder", action: () => revealItemInDir(tab.doc.path) },
    ],
  });
  await menu.popup();
}

function setupTab(tab: Tab) {
  const { el } = tab;
  el.className = "tab";
  el.title = tab.doc.path;

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("class", "tab-icon");
  icon.innerHTML = '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" />';

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = basename(tab.doc.path);

  const close = document.createElement("button");
  close.className = "tab-close";
  close.title = "Close tab";
  close.textContent = "×";
  close.addEventListener("click", () => closeTab(tab));

  el.append(icon, title, close);
  el.addEventListener("pointerdown", (event) => drag(tab, event));
  el.addEventListener("auxclick", (event) => {
    if (event.button === 1) closeTab(tab);
  });
  el.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showMenu(tab);
  });
}

function drag(tab: Tab, down: PointerEvent) {
  if (down.button !== 0 || (down.target instanceof Element && down.target.closest(".tab-close"))) return;
  activate(tab);
  tab.el.setPointerCapture(down.pointerId);
  const grab = down.clientX - tab.el.getBoundingClientRect().left;
  const title = basename(tab.doc.path);
  let dragging = false;
  let detached = false;
  let frame = 0;
  let pending: Promise<unknown> | undefined;
  let queued = false;

  const sendMove = () => {
    if (pending) {
      queued = true;
      return;
    }
    pending = invoke("drag_tab_move", { title })
      .catch(() => {})
      .finally(() => {
        pending = undefined;
        if (queued && dragging && detached) sendMove();
        queued = false;
      });
  };

  const endGhost = async () => {
    await pending;
    await invoke("drag_tab_end");
  };

  const move = (event: PointerEvent) => {
    if (!dragging && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < 5) return;
    if (!dragging) {
      dragging = true;
      tab.el.classList.add("dragging");
      document.documentElement.classList.add("dragging-tab");
    }

    const bar = strip.getBoundingClientRect();
    const wasDetached = detached;
    detached =
      event.clientY < bar.top - 24 ||
      event.clientY > bar.bottom + 24 ||
      event.clientX < bar.left ||
      event.clientX > bar.right;
    tab.el.classList.toggle("detached", detached);

    if (detached) {
      tab.el.style.transform = "";
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sendMove);
      return;
    }
    if (wasDetached) endGhost();

    const index = indexAt(event.clientX, tab);
    if (tabs.indexOf(tab) !== index) {
      const others = tabs.filter((t) => t !== tab);
      strip.insertBefore(tab.el, others[index]?.el ?? null);
      tabs.splice(tabs.indexOf(tab), 1);
      tabs.splice(index, 0, tab);
    }
    const slot = bar.left + tab.el.offsetLeft - strip.scrollLeft;
    tab.el.style.transform = `translateX(${event.clientX - grab - slot}px)`;
  };

  const finish = async (drop: boolean) => {
    const wasDragging = dragging;
    dragging = false;
    tab.el.removeEventListener("pointermove", move);
    tab.el.removeEventListener("pointerup", onUp);
    tab.el.removeEventListener("pointercancel", onCancel);
    cancelAnimationFrame(frame);
    tab.el.classList.remove("dragging", "detached");
    tab.el.style.transform = "";
    document.documentElement.classList.remove("dragging-tab");
    if (!wasDragging || !detached) return;
    if (!drop) return endGhost();

    await pending;
    const moved = await invoke<boolean>("drop_tab", { file: request(tab), detach: tabs.length > 1 });
    if (!moved) return;
    closeTab(tab);
    if (!tabs.length) appWindow.close();
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);

  tab.el.addEventListener("pointermove", move);
  tab.el.addEventListener("pointerup", onUp);
  tab.el.addEventListener("pointercancel", onCancel);
}
