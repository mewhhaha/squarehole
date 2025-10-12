import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { Router, type Env, type fragment } from "../src/router.mts";
import { Client, useState } from "../src/client.mts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

function extractClientScript(html: string): string {
  const m = html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Client script not found");
  return m[1];
}

async function waitFor(check: () => boolean, timeoutMs = 700) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor timeout");
}

describe("Attribute binding (class)", () => {
  it("updates class attribute when signal changes", async () => {
    const active = useState(false);

    function toggle(this: any) {
      this.active.set((v: boolean) => !v);
    }
    (toggle as any).active = active;

    function classFor(_el: Element, _ev: Event, s: any) {
      return s.active.get() ? "is-active" : "";
    }
    (classFor as any).active = active;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="t" onClick={toggle}>Toggle</button>
                <div id="p" class={classFor}>Panel</div>
                <Client />
              </body>
            </html>
          ),
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    const dom = new JSDOM(
      "<!doctype html><html><head></head><body></body></html>",
      { url: "https://example.com/", runScripts: "dangerously", pretendToBeVisual: true },
    );
    const { window } = dom;
    const doc = window.document;
    doc.body.innerHTML = html.replace(/^<!doctype html>/i, "");

    (window as any).__import = async (spec: string) => {
      if (!spec.startsWith("/_client/f/")) throw new Error("Unexpected spec: " + spec);
      const modRes = await router.handle(new Request("https://example.com" + spec), {} as Env, ctx);
      const code = await modRes.text();
      const body = code.replace(/^\s*export\s+default\s+/, "return { default: ");
      const final = body.replace(/;\s*$/, " }");
      const factory = new (window as any).Function(final);
      return factory();
    };

    const script = extractClientScript(html).replaceAll(/\bimport\s*\(/g, "window.__import(");
    window.eval(script);

    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

    const panel = doc.getElementById("p")! as HTMLElement;
    await waitFor(() => panel.className === "", 1000);
    expect(panel.className).toBe("");

    const btn = doc.getElementById("t")!;
    btn.dispatchEvent(new window.Event("click", { bubbles: true }));

    await waitFor(() => /\bis-active\b/.test(panel.className), 1000);
    expect(panel.className).toMatch(/\bis-active\b/);
  });
});

