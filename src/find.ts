import type { Doc } from "./doc";
import { element } from "./dom";

const bar = element("#find");
const field = element("#find-input", HTMLInputElement);
const count = element("#find-count");
let doc: Doc | undefined;
let marks: HTMLElement[] = [];
let current = 0;

export function openFind() {
  bar.hidden = false;
  field.focus();
  field.select();
}

export function closeFind() {
  bar.hidden = true;
  clear();
}

export function findNext(step = 1) {
  if (bar.hidden) return openFind();
  if (!marks.length) return;
  select((current + step + marks.length) % marks.length);
}

export function updateFind(next?: Doc) {
  doc = next;
  if (!bar.hidden) search();
}

function clear() {
  for (const mark of marks) {
    const parent = mark.parentNode;
    mark.replaceWith(...mark.childNodes);
    parent?.normalize();
  }
  marks = [];
  count.textContent = "";
}

function search() {
  clear();
  const query = field.value.toLowerCase();
  if (!query || !doc) return;

  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("svg, .katex, mark") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    if (walker.currentNode instanceof Text) nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    let text = node;
    let index = text.data.toLowerCase().indexOf(query);
    while (index >= 0) {
      const match = text.splitText(index);
      text = match.splitText(query.length);
      const mark = document.createElement("mark");
      mark.className = "find-hit";
      match.replaceWith(mark);
      mark.append(match);
      marks.push(mark);
      index = text.data.toLowerCase().indexOf(query);
    }
  }

  if (marks.length) select(0);
  else count.textContent = "No results";
}

function select(index: number) {
  marks[current]?.classList.remove("current");
  current = index;
  marks[current].classList.add("current");
  marks[current].closest("details")?.setAttribute("open", "");
  marks[current].scrollIntoView({ block: "center" });
  count.textContent = `${current + 1} of ${marks.length}`;
}

let timer = 0;
field.addEventListener("input", () => {
  clearTimeout(timer);
  timer = window.setTimeout(search, 120);
});

field.addEventListener("keydown", (event) => {
  if (event.key === "Enter") findNext(event.shiftKey ? -1 : 1);
  if (event.key === "Escape") closeFind();
});
