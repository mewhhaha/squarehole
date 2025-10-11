/**
 * @module
 * Internal server-side registry for shipping small client handlers on demand.
 */

const registry = new Map<string, string>();

/**
 * Registers a function source under an id for dynamic serving.
 */
export function registerClientFunction(id: string, source: string): void {
  registry.set(id, source);
}

/**
 * Resolves the ESM module code for a given function id.
 */
export function resolveClientFunctionModule(id: string): string | undefined {
  const source = registry.get(id);
  if (!source) return undefined;
  // Wrap the function source as an ESM default export.
  // The source must evaluate to a function: (el: Element, e: Event, state: any) => any
  return `export default ${source};`;
}

/**
 * Serves a registered function module for a request path like /_sh/f/<id>.js
 */
export function serveClientFunction(pathname: string): Response {
  const match = pathname.match(/^\/_sh\/f\/([A-Za-z0-9_-]+)\.js$/);
  const id = match?.[1];
  if (!id) return new Response("", { status: 404 });

  const mod = resolveClientFunctionModule(id);
  if (!mod) return new Response("", { status: 404 });
  return new Response(mod, {
    status: 200,
    headers: { "Content-Type": "text/javascript; charset=utf-8" },
  });
}

