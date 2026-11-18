import { emit, listen } from "@tauri-apps/api/event";

interface Setting {
  key: string;
  value: string;
}

export function saveSetting(key: string, value: string) {
  localStorage.setItem(key, value);
  emit("setting", { key, value });
}

export function onSetting(key: string, callback: (value: string) => void) {
  listen<Setting>("setting", ({ payload }) => {
    if (payload.key === key) callback(payload.value);
  });
}
