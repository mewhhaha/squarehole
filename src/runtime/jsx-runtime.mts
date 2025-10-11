/**
 * @module
 *
 * Custom JSX runtime for Squarehole - a zero-dependency, streaming-first implementation.
 * Provides automatic HTML escaping and support for async components.
 *
 * @example
 * ```tsx
 * // Configure TypeScript to use this runtime
 * // tsconfig.json:
 * {
 *   "compilerOptions": {
 *     "jsx": "react-jsx",
 *     "jsxImportSource": "@mewhhaha/squarehole"
 *   }
 * }
 *
 * // Then write JSX as normal
 * const Component = () => <div>Hello World</div>;
 * ```
 */

import { into, isHtml, type Html } from "./node.mts";
import { SIGNAL } from "./signal.mts";
import { define } from "../client.mts";
import { withComponentFrame } from "./hooks.mts";
import "./typed.mts";
import type { JSX } from "./typed.mts";
export type * from "./typed.mts";
export { type JSX } from "./jsx.mts";
/**
 * Converts various inputs into an Html instance for streaming.
 * @see {@link into}
 */
export { into };

/**
 * Fragment component for grouping multiple elements without a wrapper.
 */
export const Fragment = (props: any): any => jsx("", props);

// Void elements are self-closing and shouldn't have a closing tag
const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Core JSX factory function that creates HTML elements or calls component functions.
 *
 * @param tag - HTML tag name or component function
 * @param props - Element properties and children
 * @returns Html instance for streaming
 */
export function jsx(
  tag: string | Function,
  { children, ...props }: { children?: unknown } & Record<string, any>,
): Html {
  if (typeof tag === "function") {
    return withComponentFrame(() => tag({ children, ...props }));
  }

  let attrs = "";
  let dangerousHtml: string | undefined;

  for (const key in props) {
    let value = props[key];

    // Event handler sugar: on={function click(){...}}
    // Uses the function name as the event type (e.g., "click").
    if (key === "on" && typeof value === "function") {
      const name = (value as Function).name?.trim();
      if (name) {
        const event = name.toLowerCase();
        const ref = define(value as any);
        // Capture enumerable function properties as initial context/args
        const args = Object.fromEntries(Object.entries(value as any));
        const payload = { ...(ref as any), a: args };
        const encoded = btoa(
          unescape(encodeURIComponent(JSON.stringify(payload))),
        );
        attrs += ` data-sh-${event}="${encoded}" `;
        continue;
      }
    }

    // Handle dangerouslySetInnerHTML
    if (
      key === "dangerouslySetInnerHTML" &&
      typeof value === "object" &&
      value !== null &&
      "__html" in value
    ) {
      dangerousHtml = value.__html;
      continue;
    }

    let sanitized = sanitize(value);
    if (sanitized === undefined) {
      continue;
    }

    // Special case for class to make the class names more readable

    if (key === "class") {
      sanitized = sanitized
        ?.split(/\s+/g)
        .filter((x: string) => x !== "")
        .join(" ");
    }

    attrs += ` ${key}="${sanitized}" `;
  }

  const generator = async function* (): AsyncGenerator<string> {
    if (tag) {
      yield `<${tag}${attrs}>`;
    }

    // If dangerouslySetInnerHTML is provided, use it instead of children
    if (dangerousHtml !== undefined) {
      yield dangerousHtml;
    } else {
      async function* processChild(child: unknown): AsyncGenerator<string> {
        if (child === undefined || child === null || child === false) {
          return;
        }
        if (child instanceof Promise) {
          const resolved = await child;
          yield* processChild(resolved);
          return;
        }
        if (isHtml(child)) {
          yield* child.text;
          return;
        }
        if (Array.isArray(child)) {
          for (let i = 0; i < child.length; i++) {
            const c = child[i];
            yield* processChild(c);
          }
          return;
        }

        if (typeof child === "function") {
          // Treat function children as mini-components for hook scoping
          yield* into(withComponentFrame(() => child())).text;
          return;
        }

        // Auto-render Squarehole signal values as bound text placeholders
        if (
          typeof child === "object" &&
          child !== null &&
          // Prefer symbol marker, fall back to legacy flag
          ((child as any)[SIGNAL] === true || (child as any).__sh === "sig")
        ) {
          const sig: any = child as any;
          const id = String(sig.id ?? "");
          const initial = sig.initial;
          const encoded = btoa(
            unescape(encodeURIComponent(JSON.stringify(initial))),
          );
          const content = escapeHtml(String(initial));
          yield `<span data-sh-t="${id}" data-sh-v="${encoded}">${content}</span>`;
          return;
        }

        yield escapeHtml(child.toString());
      }

      yield* processChild(children);
    }

    if (tag && !voidElements.has(tag)) {
      yield `</${tag}>`;
    }
  };

  return into(generator());
}

/**
 * Escapes HTML special characters to prevent XSS attacks.
 *
 * @param input - String to escape
 * @returns Escaped string safe for HTML output
 */
export function escapeHtml(input: string): string {
  return input.replaceAll(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

const sanitize = (value: any) => {
  if (typeof value === "string") {
    return value.replaceAll(/"/g, "&quot;");
  }
  if (value === null || value === undefined || value === false) {
    return undefined;
  }

  if (value === true) {
    return "true";
  }

  if (typeof value === "number") {
    return value.toString();
  }
};

/**
 * JSX factory for multiple children (same as jsx in this implementation).
 *
 * @param tag - HTML tag name or component function
 * @param props - Element properties and children
 * @returns JSX element
 */
export function jsxs(tag: any, props: any): JSX.Element {
  return jsx(tag, props);
}
