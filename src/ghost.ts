import { getCurrentWindow } from "@tauri-apps/api/window";
import { element } from "./dom";

const mode = localStorage.getItem("theme");
const dark = mode === "dark" || (mode !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.dataset.theme = dark ? "dark" : "light";
element("#title").textContent = await getCurrentWindow().title();
