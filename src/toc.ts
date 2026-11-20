import type { Doc } from "./doc";
import { element } from "./dom";
import { basename } from "./paths";

const sidebar = element("#sidebar");
const nav = element("#toc");
const title = element("#sidebar-title");
const empty = element("#toc-empty");
const filter = element("#toc-filter", HTMLInputElement);
const clear = element("#toc-clear");
const resizer = element("#sidebar-resizer");

let headings: HTMLElement[] = [];
let links: HTMLElement[] = [];
let scroller: HTMLElement | undefined;
let frame = 0;
let selected = -1;

const opened = new WeakSet<Doc>();
const skeleton = [1, 2, 2, 3, 3, 2, 3, 2].map((level, i) => {
  const row = document.createElement("div");
  row.className = `toc-skeleton toc-h${level}`;
  row.style.width = `${[70, 55, 80, 45, 60, 75, 50, 65][i]}%`;
  return row;
});
sidebar.style.width = `${Number(localStorage.getItem("toc-width")) || 260}px`;

export function toggleToc(show = sidebar.hidden) {
  sidebar.hidden = !show;
}

export function searchToc() {
  toggleToc(true);
  filter.focus();
  filter.select();
}

export function updateToc(doc?: Doc) {
  if (doc && !opened.has(doc)) {
    opened.add(doc);
    toggleToc(true);
  }
  scroller?.removeEventListener("scroll", onScroll);
  scroller = doc?.scroller;
  scroller?.addEventListener("scroll", onScroll, { passive: true });
  title.textContent = doc ? basename(doc.path) : "No file open";

  if (doc?.loading) {
    headings = [];
    links = [];
    empty.hidden = true;
    nav.replaceChildren(...skeleton);
    return;
  }

  headings = doc ? [...doc.body.querySelectorAll<HTMLElement>("h1, h2, h3, h4")] : [];
  links = headings.map((heading) => {
    const link = document.createElement("button");
    link.className = `toc-${heading.tagName.toLowerCase()}`;
    link.textContent = heading.textContent;
    link.title = heading.textContent ?? "";
    link.addEventListener("click", () => heading.scrollIntoView());
    return link;
  });
  nav.replaceChildren(...links);
  applyFilter();
  highlight();
}

function visible() {
  return links.filter((link) => !link.hidden);
}

function applyFilter() {
  const query = filter.value.trim().toLowerCase();
  for (const link of links) {
    link.hidden = !!query && !(link.textContent ?? "").toLowerCase().includes(query);
  }
  nav.classList.toggle("filtering", !!query);
  clear.hidden = !filter.value;
  select(-1);

  const count = visible().length;
  empty.hidden = count > 0;
  empty.textContent = links.length ? "No matching headings" : "No headings in this file";
}

function select(index: number) {
  const items = visible();
  items[selected]?.classList.remove("selected");
  selected = Math.max(-1, Math.min(index, items.length - 1));
  items[selected]?.classList.add("selected");
  items[selected]?.scrollIntoView({ block: "nearest" });
}

function onScroll() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(highlight);
}

function highlight() {
  const top = (scroller?.getBoundingClientRect().top ?? 0) + 80;
  const current = headings.findLastIndex((heading) => heading.getBoundingClientRect().top <= top);
  links.forEach((link, i) => link.classList.toggle("current", i === Math.max(current, 0)));
}

filter.addEventListener("input", applyFilter);

clear.addEventListener("click", () => {
  filter.value = "";
  applyFilter();
  filter.focus();
});

filter.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    select(selected + (event.key === "ArrowDown" ? 1 : -1));
  } else if (event.key === "Enter") {
    visible()[Math.max(selected, 0)]?.click();
  } else if (event.key === "Escape") {
    if (filter.value) {
      filter.value = "";
      applyFilter();
    } else {
      filter.blur();
    }
  }
});

resizer.addEventListener("pointerdown", (down) => {
  if (down.button !== 0) return;
  down.preventDefault();
  resizer.setPointerCapture(down.pointerId);
  resizer.classList.add("active");
  document.documentElement.classList.add("resizing");
  const { left, width: startWidth } = sidebar.getBoundingClientRect();

  const move = (event: PointerEvent) => {
    const width = event.clientX - left;
    sidebar.classList.toggle("collapsing", width < 100);
    sidebar.style.width = `${Math.min(Math.max(width, 160), innerWidth * 0.5)}px`;
  };

  const up = () => {
    resizer.removeEventListener("pointermove", move);
    resizer.removeEventListener("pointerup", up);
    resizer.classList.remove("active");
    document.documentElement.classList.remove("resizing");
    if (sidebar.classList.contains("collapsing")) {
      sidebar.classList.remove("collapsing");
      sidebar.style.width = `${startWidth}px`;
      toggleToc(false);
    } else {
      localStorage.setItem("toc-width", String(parseInt(sidebar.style.width)));
    }
  };

  resizer.addEventListener("pointermove", move);
  resizer.addEventListener("pointerup", up);
});
