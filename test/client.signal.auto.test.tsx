import { describe, it, expect } from "vitest";
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

describe("Signal auto-render in JSX", () => {
  it("renders a signal child as a bound span with seed attrs", async () => {
    const count = useState(7);

    // Handler via onClick with function property for state
    function click(this: any) {
      this.count.set((v: number) => v + 1);
    }
    (click as any).count = count;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="btn" onClick={click}>{count}</button>
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

    // Should inject span with data-client-t and data-client-v
    const tAttr = html.match(/data-client-t="([^"]+)"/);
    expect(tAttr?.[1]).toBe(count.id);
    const vAttr = html.match(/data-client-v="([^"]+)"/);
    expect(vAttr).toBeTruthy();
    const decoded = JSON.parse(decodeURIComponent(escape(atob(vAttr![1]))));
    expect(decoded).toBe(7);
  });
});
