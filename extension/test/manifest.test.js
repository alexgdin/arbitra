import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import manifest from "../manifest.json";
import { DEFAULT_SETTINGS } from "../src/settings.js";

const ROOT = join(import.meta.dir, "..");

const STORE_MATCHES = [
  "https://www.emag.ro/*",
  "https://www.pcgarage.ro/*",
  "https://altex.ro/*",
  "https://www.altex.ro/*",
];

describe("manifest.json", () => {
  test("identitate și versiune minimă", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("Arbitra");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.minimum_chrome_version).toBe("110");
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.description.length).toBeLessThanOrEqual(132); // limita Chrome Web Store
  });

  test("doar permisiunea storage, fără tabs, cookies sau webRequest", () => {
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest).not.toHaveProperty("web_accessible_resources");
    expect(manifest).not.toHaveProperty("externally_connectable");
  });

  test("hosturile: cele trei magazine, API-ul implicit și opționale pentru adresa configurată", () => {
    expect(manifest.host_permissions).toEqual([...STORE_MATCHES, "http://localhost:3000/*"]);
    expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
  });

  test("API-ul implicit din setări are permisiune în manifest (altfel cererile ar fi blocate de CORS)", () => {
    const { origin } = new URL(DEFAULT_SETTINGS.apiBase);

    expect(manifest.host_permissions).toContain(`${origin}/*`);
  });

  test("content script-ul rulează doar pe magazine, în ordinea cerută", () => {
    expect(manifest.content_scripts).toHaveLength(1);
    const [script] = manifest.content_scripts;

    expect(script.matches).toEqual(STORE_MATCHES);
    expect(script.js).toEqual(["src/extract.js", "src/overlay.js", "src/content.js"]);
    expect(script.run_at).toBe("document_idle");
    expect(script.all_frames).toBe(false);
  });

  test("service worker ca modul ES", () => {
    expect(manifest.background).toEqual({ service_worker: "src/background.js", type: "module" });
  });

  test("popup, setări și iconițe", () => {
    const icons = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };

    expect(manifest.action).toEqual({
      default_popup: "popup.html",
      default_title: "Arbitra",
      default_icon: icons,
    });
    expect(manifest.options_ui).toEqual({ page: "options.html", open_in_tab: true });
    expect(manifest.icons).toEqual(icons);
  });

  test("toate fișierele referite există", () => {
    const files = [
      manifest.background.service_worker,
      ...manifest.content_scripts.flatMap((script) => script.js),
      manifest.action.default_popup,
      manifest.options_ui.page,
      ...Object.values(manifest.icons),
    ];

    for (const file of files) {
      expect({ file, exists: existsSync(join(ROOT, file)) }).toEqual({ file, exists: true });
    }
  });
});
