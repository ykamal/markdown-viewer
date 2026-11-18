import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { element } from "./dom";

const banner = element("#update");
const text = element("#update-text");
let ready: Update | undefined;
let checking = false;

export async function checkForUpdates(manual = false) {
  if (ready) return showBanner(ready);
  if (checking) return;
  checking = true;
  try {
    const update = await check();
    if (!update) {
      if (manual) await message("You're on the latest version.", { title: "No updates" });
      return;
    }
    await update.download();
    ready = update;
    showBanner(update);
  } catch (error) {
    if (manual) await message(`Couldn't check for updates.\n\n${error}`, { title: "Update failed", kind: "error" });
  } finally {
    checking = false;
  }
}

export async function installUpdate() {
  if (!ready) return;
  await ready.install();
  await relaunch();
}

export function dismissUpdate() {
  banner.hidden = true;
}

function showBanner(update: Update) {
  text.textContent = `Version ${update.version} is ready to install.`;
  banner.hidden = false;
}

if (!import.meta.env.DEV && getCurrentWindow().label === "main") {
  setTimeout(checkForUpdates, 3000);
}
