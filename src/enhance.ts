export async function enhance(body: HTMLElement) {
  await Promise.all([highlight(body), math(body), diagrams(body)]);
}

async function highlight(body: HTMLElement) {
  const blocks = body.querySelectorAll<HTMLElement>("pre > code[class*='language-']");
  if (!blocks.length) return;
  const [{ default: hljs }] = await Promise.all([
    import("highlight.js/lib/common"),
    import("highlight.js/styles/github.css"),
  ]);
  for (const block of blocks) {
    const lang = block.className.match(/language-(\S+)/)?.[1];
    if (lang && hljs.getLanguage(lang)) hljs.highlightElement(block);
  }
}

async function math(body: HTMLElement) {
  const nodes = body.querySelectorAll<HTMLElement>(".math");
  if (!nodes.length) return;
  const [{ default: katex }] = await Promise.all([import("katex"), import("katex/dist/katex.min.css")]);
  for (const node of nodes) {
    katex.render(node.textContent ?? "", node, {
      displayMode: node.dataset.display === "true",
      throwOnError: false,
    });
  }
}

async function diagrams(body: HTMLElement) {
  const nodes = [...body.querySelectorAll<HTMLElement>("pre.mermaid")];
  if (!nodes.length) return;
  const { default: mermaid } = await import("mermaid");
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
  await mermaid.run({ nodes, suppressErrors: true });
}
