import { type JSX } from "./runtime/jsx.mjs";
import { into, isHtml, type Html } from "./runtime/node.mts";

export type { Html } from "./runtime/node.mts";
export type { JSX } from "./runtime/jsx.mts";

export const render = (value: Html = into("")): string => {
  return value.toString();
};

export interface Env {}

export interface ctx {
  request: Request;
  params: Record<string, string>;
  context: [Env, ExecutionContext];
}

export type loader = (params: any) => any;
export type action = (params: any) => any;
export type renderer = (
  props: any,
) => JSX.Element | Promise<JSX.Element | string>;
export type headers = (
  params: ctx & {
    loaderData: any | never;
  },
) =>
  | Promise<Record<string, string | undefined | null> | Headers>
  | Record<string, string | undefined | null>
  | Headers;

export type mod = {
  loader?: loader;
  action?: action;
  default?: renderer;
  headers?: headers;
};

export type fragment = { id: string; mod: mod; params?: string[] };

// Route is now just [path, regex, fragments]
export type route = [pattern: URLPattern, fragments: fragment[]];

export type router = {
  handle: (request: Request, ...args: ctx["context"]) => Promise<Response>;
};

export const Router = (routes: route[]): router => {
  const handle = async (
    request: Request,
    ...args: ctx["context"]
  ): Promise<Response> => {
    const urlStr = request.url;
    let fragments: fragment[] | undefined;
    let params: Record<string, string> | undefined;
    for (const [pattern, frags] of routes) {
      const match = pattern.exec(urlStr);
      if (match) {
        fragments = frags;
        params = match.pathname.groups;
        break;
      }
    }
    if (!fragments || !params) {
      return new Response(null, { status: 404 });
    }

    if (request.headers.has("fx-request")) {
      fragments = fragments.slice(1);
    }

    const ctx = { request, params, context: args };

    try {
      const leaf = fragments[fragments.length - 1]?.mod;

      if (request.method === "GET" && leaf?.default) {
        return await routeResponse(fragments, ctx);
      }

      if (request.method === "GET" && leaf?.loader) {
        return await dataResponse(leaf.loader, ctx);
      }

      if (request.method !== "GET" && leaf?.action) {
        return await dataResponse(leaf.action, ctx);
      }

      return new Response(null, { status: 404 });
    } catch (e) {
      if (e instanceof Response) {
        return e;
      }

      if (e instanceof Error) {
        console.error(e.message);
      }

      return new Response(null, { status: 500 });
    }
  };

  return {
    handle,
  };
};

const dataResponse = async (f: action | loader, ctx: ctx) => {
  const value = await f(ctx);
  if (value instanceof Response) {
    return value;
  }
  return Response.json(value);
};

const routeResponse = async (fragments: fragment[], ctx: ctx) => {
  const loaders = await Promise.all(
    fragments.map((fragment) => fragment.mod.loader?.(ctx)),
  );

  const init = new Headers({
    "Content-Type": "text/html",
  });
  const headers = await mergeFragmentHeaders(init, ctx, fragments, loaders);

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const node = fragments.reduceRight((acc, frag, index) => {
    const { mod } = frag;
    const Component = mod.default;
    const loaderData = loaders[index];
    const res = Component ? Component({ loaderData, children: acc }) : acc;

    if (isHtml(res)) {
      return res;
    }
    return into(res);
  }, into(""));

  const htmlStream = node.toReadableStream();
  const reader = htmlStream.getReader();

  const startStreaming = async () => {
    try {
      const textEncoder = new TextEncoder();
      await writer.write(textEncoder.encode("<!doctype html>"));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } finally {
      reader.releaseLock();
      await writer.close();
    }
  };

  ctx.context[1].waitUntil(startStreaming());

  return new Response(stream.readable, {
    headers,
    status: 200,
  });
};

const mergeFragmentHeaders = async (
  headers: Headers,
  ctx: ctx,
  fragments: fragment[],
  loaders: (Promise<unknown> | undefined)[],
) => {
  for (let i = 0; i < fragments.length; i++) {
    const { mod } = fragments[i];
    if (!mod.headers) continue;
    const h = await mod.headers({ ...ctx, loaderData: loaders[i] });
    if (!h) continue;
    for (const [k, v] of h instanceof Headers ? h : Object.entries(h)) {
      if (v != null) headers.append(k, v);
    }
  }
  return headers;
};
