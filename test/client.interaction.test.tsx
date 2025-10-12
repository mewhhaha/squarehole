import { describe, it, expect } from "vitest";
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

describe("Client interactions (no bundler)", () => {
  it("renders data attributes and serves function module", async () => {
    function click(this: any, el: Element) {
      (el as HTMLElement).textContent = String(
        Number((el as HTMLElement).textContent || "0") + this.by,
      );
    }
    (click as any).by = 2;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="b" onClick={click}>0</button>
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
    const m = html.match(/data-client-click="([^"]+)"/);
    expect(m).toBeTruthy();
    const encoded = m![1];
    const json = decodeURIComponent(escape(atob(encoded)));
    const payload = JSON.parse(json);
    expect(payload.t).toBe("f");
    expect(typeof payload.i).toBe("string");
    expect(payload.a).toEqual({ by: 2 });

    // Now fetch the function module via the built-in route
    const modRes = await router.handle(
      new Request(`https://example.com/_client/f/${payload.i}.js`),
      {} as Env,
      ctx,
    );
    const code = await modRes.text();
    expect(modRes.status).toBe(200);
    expect(code.trim().startsWith("export default ")).toBe(true);
  });
});
