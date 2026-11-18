import MarkdownIt from "markdown-it";
import { alert } from "@mdit/plugin-alert";
import { fullEmoji } from "@mdit/plugin-emoji";
import { footnote } from "@mdit/plugin-footnote";
import { tasklist } from "@mdit/plugin-tasklist";
import { tex } from "@mdit/plugin-tex";
import GithubSlugger from "github-slugger";
import DOMPurify from "dompurify";

const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

const md: InstanceType<typeof MarkdownIt> = new MarkdownIt({
  html: true,
  linkify: true,
  highlight: (code, lang) =>
    lang === "mermaid" ? `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>` : "",
})
  .use(alert)
  .use(fullEmoji)
  .use(footnote)
  .use(tasklist, { containerClass: "contains-task-list" })
  .use(tex, {
    mathFence: true,
    render: (content, displayMode) => {
      const tag = displayMode ? "div" : "span";
      return `<${tag} class="math" data-display="${displayMode}">${md.utils.escapeHtml(content)}</${tag}>`;
    },
  });

md.core.ruler.push("heading_ids", (state) => {
  const slugger = new GithubSlugger();
  state.tokens.forEach((token, i) => {
    if (token.type !== "heading_open") return;
    const text = (state.tokens[i + 1].children ?? [])
      .filter((child) => child.type === "text" || child.type === "code_inline")
      .map((child) => child.content)
      .join("");
    token.attrSet("id", slugger.slug(text));
  });
});

export function render(source: string): DocumentFragment {
  const html = md.render(source.replace(frontMatter, "```yaml\n$1\n```\n"));
  return DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ["style"],
    FORBID_ATTR: ["style"],
  });
}
