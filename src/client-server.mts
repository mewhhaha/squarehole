/**
 * @module
 * Internal server-side registry for shipping small client handlers on demand.
 */

const registry = new Map<string, string>();

export interface ClientFunctionStorage {
  get(id: string): Promise<string | undefined> | string | undefined;
  put(id: string, source: string): Promise<void> | void;
}

let storage: ClientFunctionStorage = {
  get: (id) => registry.get(id),
  put: (id, source) => {
    registry.set(id, source);
  },
};

export function setClientFunctionStorage(s: ClientFunctionStorage): void {
  storage = s;
}

// Note: External storage adapters can be provided via Router(routes, storage).

/**
 * Registers a function source under an id for dynamic serving.
 */
export function registerClientFunction(id: string, source: string): void {
  // Delegate to configured storage (defaults to in-memory registry)
  storage.put(id, source);
}

/**
 * Resolves the ESM module code for a given function id.
 */
export async function resolveClientFunctionModule(
  id: string,
): Promise<string | undefined> {
  const source = await storage.get(id);
  if (!source) return undefined;
  // Wrap the function source as an ESM default export.
  // The source must evaluate to a function: (el: Element, e: Event, state: any) => any
  return `export default ${source};`;
}

/**
 * Serves a registered function module for a request path like /_client/f/<id>.js
 */
export async function serveClientFunction(
  pathname: string,
  request?: Request,
  execution?: ExecutionContext,
): Promise<Response> {
  const match = pathname.match(/^\/_client\/f\/([A-Za-z0-9_-]+)\.js$/);
  const id = match?.[1];
  if (!id) return new Response("", { status: 404 });

  // Try edge cache first if available
  const hasCaches = typeof (globalThis as any).caches !== "undefined";
  try {
    if (hasCaches && request) {
      const hit = await caches.default.match(request);
      if (hit) return hit;
    }
  } catch {
    // ignore cache errors and fall back to registry
  }

  const mod = await resolveClientFunctionModule(id);
  if (!mod) return new Response("", { status: 404 });

  const response = new Response(mod, {
    status: 200,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });

  // Populate cache for future isolates in the same POP
  if (hasCaches && request) {
    const put = caches.default.put(request, response.clone());
    if (execution && typeof execution.waitUntil === "function") {
      execution.waitUntil(put);
    } else {
      try { await put; } catch {}
    }
  }

  return response;
}
