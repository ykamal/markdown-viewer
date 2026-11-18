import type { Doc } from "./doc";
import { element } from "./dom";

const nav = element("#toc");
let headings: HTMLElement[] = [];
let links: HTMLElement[] = [];
let scroller: HTMLElement | undefined;
let frame = 0;

nav.hidden = localStorage.getItem("toc") !== "open";

export function toggleToc() {
  nav.hidden = !nav.hidden;
  localStorage.setItem("toc", nav.hidden ? "closed" : "open");
}

export function updateToc(doc?: Doc) {
  scroller?.removeEventListener("scroll", onScroll);
  scroller = doc?.scroller;
  scroller?.addEventListener("scroll", onScroll, { passive: true });

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
  highlight();
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
