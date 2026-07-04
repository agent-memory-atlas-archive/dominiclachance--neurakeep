import { describe, expect, it } from "vitest";
import { appHtml, appShellJs } from "../src/app/frontend.js";

describe("browser UI smoke surface", () => {
  it("ships all route screens and core buttons", () => {
    const html = appHtml();
    for (const id of [
      "graphView",
      "searchView",
      "inboxView",
      "proposalsView",
      "qualityView",
      "settingsView",
      "refresh",
      "saveGraphState",
      "pinSelected",
      "collapseSelected",
      "search",
      "propose",
      "apply",
      "autoIngest",
      "watcher",
      "writeSummary",
      "quality",
      "selfPolicy",
      "modalBackdrop",
      "citationPreview",
      "toastStack"
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    for (const route of ["graph", "search", "inbox", "proposals", "quality", "settings"]) {
      expect(html).toContain(`data-route="${route}"`);
    }
  });

  it("parses the shipped browser scripts", () => {
    const html = appHtml();
    const inlineScript = /<script>\n([\s\S]*?)\n  <\/script>/.exec(html)?.[1];
    expect(inlineScript).toBeTruthy();
    expect(() => new Function(inlineScript ?? "")).not.toThrow();
    expect(() => new Function(appShellJs())).not.toThrow();
  });

  it("keeps citation previews behind active modals", () => {
    const html = appHtml();
    expect(html).toContain(".modalBackdrop { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 50;");
    expect(html).toContain(".citationPreview { position: fixed; display: none; z-index: 35;");
    expect(html).toContain("if (modalBackdrop.classList.contains('open')) return;");
    expect(html).toContain("function hideCitationPreview()");
    expect(html).toContain("hideCitationPreview();\n      modalTitle.textContent");
  });
});
