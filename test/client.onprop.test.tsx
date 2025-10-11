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

describe("JSX on prop sugar", () => {
  it("supports on={function click(){}} using function name as event", async () => {
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="c" on={function click(el: Element){ (el as HTMLElement).textContent = 'x'; }}>0</button>
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
    const m = html.match(/data-sh-click="([^"]+)"/);
    expect(m).toBeTruthy();
  });
});
