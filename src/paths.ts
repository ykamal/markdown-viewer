export function dirname(path: string) {
  return path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
}

export function basename(path: string) {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

export function isMarkdown(path: string) {
  return /\.(md|markdown|mdown|mkdn?)$/i.test(path);
}

export function resolvePath(dir: string, relative: string) {
  const windows = /^[a-z]:/i.test(dir);
  const base = "file:///" + dir.replaceAll("\\", "/").replace(/^\/+/, "") + "/";
  const path = decodeURIComponent(new URL(relative, base).pathname);
  return windows ? path.slice(1).replaceAll("/", "\\") : path;
}
