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

export async function openTab({ path, scroll }: OpenRequest) {
  const existing = tabs.find((tab) => tab.doc.path === path);
  if (existing) return activate(existing);

  const doc = createDoc(path, (target) => openTab({ path: target, scroll: 0 }));
  const tab: Tab = { doc, el: document.createElement("div") };
  setupTab(tab);
  tabs.push(tab);
  strip.append(tab.el);
  docs.append(doc.scroller);
  activate(tab);
  await refresh(tab, true);
  doc.scroller.scrollTop = scroll;
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
  } catch (error) {
    tab.doc.body.textContent = `Couldn't open ${tab.doc.path}: ${error}`;
  }
  scroller.scrollTop = top;
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
}

function closeTab(tab: Tab) {
  const index = tabs.indexOf(tab);
  tabs.splice(index, 1);
  tab.el.remove();
  tab.doc.scroller.remove();
  if (tab !== active) return;

  active = undefined;
  const next = tabs[Math.min(index, tabs.length - 1)];
  if (next) {
    activate(next);
  } else {
    start.hidden = false;
    appWindow.setTitle("Readme Viewer");
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

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = basename(tab.doc.path);

  const close = document.createElement("button");
  close.className = "tab-close";
  close.title = "Close tab";
  close.textContent = "×";
  close.addEventListener("click", () => closeTab(tab));

  el.append(title, close);
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
  let dragging = false;

  const move = (event: PointerEvent) => {
    if (!dragging && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < 5) return;
    dragging = true;
    tab.el.classList.add("dragging");

    const others = tabs.filter((t) => t !== tab);
    let index = others.findIndex((t) => {
      const rect = t.el.getBoundingClientRect();
      return event.clientX < rect.left + rect.width / 2;
    });
    if (index < 0) index = others.length;
    if (tabs.indexOf(tab) === index) return;
    tabs.splice(tabs.indexOf(tab), 1);
    tabs.splice(index, 0, tab);
    strip.insertBefore(tab.el, others[index]?.el ?? null);
  };

  const up = async (event: PointerEvent) => {
    tab.el.removeEventListener("pointermove", move);
    tab.el.removeEventListener("pointerup", up);
    tab.el.classList.remove("dragging");
    const outside =
      event.clientX < 0 || event.clientY < 0 || event.clientX > innerWidth || event.clientY > innerHeight;
    if (!dragging || !outside) return;

    const moved = await invoke<boolean>("drop_tab", { file: request(tab), detach: tabs.length > 1 });
    if (!moved) return;
    closeTab(tab);
    if (!tabs.length) appWindow.close();
  };

  tab.el.addEventListener("pointermove", move);
  tab.el.addEventListener("pointerup", up);
}
