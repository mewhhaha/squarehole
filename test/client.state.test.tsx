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

describe("Signal auto-binding and inline sugar", () => {
  it("renders signal child as bound span and encodes signal via on={fn} function property", async () => {
    const count = useState(5);
    function click(this: any) {
      this.count.set((v: number) => v + this.by);
    }
    (click as any).count = count;
    (click as any).by = 1;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="btn" on={click}>{count}</button>
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

    // Has a data-sh-click payload
    expect(html).toMatch(/data-sh-click="[^"]+"/);
    // Has bound signal marker with encoded value
    const tAttr = html.match(/data-sh-t="([^"]+)"/);
    expect(tAttr?.[1]).toBe(count.id);
    const vAttr = html.match(/data-sh-v="([^"]+)"/);
    expect(vAttr).toBeTruthy();
    const decoded = JSON.parse(decodeURIComponent(escape(atob(vAttr![1]))));
    expect(decoded).toBe(5);
  });
});
