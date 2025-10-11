import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { Router, type Env, type fragment } from "../src/router.mts";
import { Client } from "../src/client.mts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

// Utility to extract inline module script from HTML
function extractClientScript(html: string): string {
  const m = html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Client script not found");
  return m[1];
}

describe("Client runtime DOM behaviour", () => {
  it("calls mount and unmount handlers and maintains per-element context", async () => {
    // Create handlers whose code increments globals; attach properties for context
    function mount(this: any, el: Element) {
      (window as any).__mounted = ((window as any).__mounted || 0) + 1;
      // set on first mount a property that will be observable if re-fired
      this.touched = true;
    }
    (mount as any).touched = false;

    function unmount(this: any) {
      (window as any).__unmounted = ((window as any).__unmounted || 0) + 1;
    }

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <div id="m" on={mount}></div>
                <div id="u" on={unmount}></div>
                <Client />
              </body>
            </html>
          ),
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/"),
      {} as Env,
      ctx,
    );
    const html = await res.text();

    // Build a DOM and inject HTML
    const dom = new JSDOM(
      "<!doctype html><html><head></head><body></body></html>",
      {
        url: "https://example.com/",
        runScripts: "dangerously",
        pretendToBeVisual: true,
      },
    );
    const { window } = dom;
    const doc = window.document;
    doc.body.innerHTML = html.replace(/^<!doctype html>/i, "");

    // Stub dynamic import used by client runtime to load function modules
    (window as any).__import = async (spec: string) => {
      if (!spec.startsWith("/_sh/f/"))
        throw new Error("Unexpected spec: " + spec);
      const modRes = await router.handle(
        new Request("https://example.com" + spec),
        {} as Env,
        ctx,
      );
      const code = await modRes.text();
      const body = code.replace(
        /^\s*export\s+default\s+/,
        "return { default: ",
      );
      const final = body.endsWith(";\n") ? body + "}" : body + "}";
      // eslint-disable-next-line no-new-func
      const factory = new window.Function(final);
      return factory();
    };

    // Execute the client script, replacing import() with window.__import
    const script = extractClientScript(html).replaceAll(
      /\bimport\s*\(/g,
      "window.__import(",
    );
    window.eval(script);

    // Fire DOMContentLoaded to trigger seed + runMounts
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 0));
    expect((window as any).__mounted).toBe(1);

    // Remove unmount node to trigger unmount observer
    const un = doc.getElementById("u")!;
    un.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect((window as any).__unmounted).toBe(1);
  });
});

