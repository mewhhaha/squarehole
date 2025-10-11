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

describe("on={fn} lifecycle attrs", () => {
  it("emits data-sh-mount and data-sh-unmount from on={function mount/unmount(){}}", async () => {
    const count = useState(0);
    function mount(this: any){ this.count.set((v:number)=>v+1); }
    (mount as any).count = count;
    function unmount(this: any){ /* cleanup */ }

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <div id="n" on={mount} />
                <div id="u" on={unmount} />
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
    expect(html).toMatch(/id="n"[^>]*data-sh-mount=/);
    expect(html).toMatch(/id="u"[^>]*data-sh-unmount=/);
  });
});

