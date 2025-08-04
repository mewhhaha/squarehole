/**
 * @module
 *
 * Suspense components for progressive rendering in Squarehole applications.
 * Provides React-like Suspense functionality for streaming HTML responses.
 *
 * @example
 * ```tsx
 * import { Suspense, Resolve } from "@mewhhaha/squarehole/components";
 *
 * export default function Layout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <Suspense fallback={<div>Loading...</div>}>
 *           {async () => {
 *             const data = await fetchData();
 *             return <div>{data}</div>;
 *           }}
 *         </Suspense>
 *         {children}
 *         <Resolve />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */

import { type JSX, into } from "./jsx-runtime.mts";

const suspended = new Map<string, Promise<[id: string, html: string]>>();

type SuspenseProps<AS extends keyof JSX.IntrinsicElements = "div"> = {
  as?: AS;
  fallback: JSX.Element;
  children: JSX.Element | (() => Promise<JSX.Element>);
} & Omit<JSX.IntrinsicElements[AS], "children">;

/**
 * Suspense component that renders a fallback while children are loading.
 *
 * @param props - Component props
 * @param props.fallback - JSX to render while children are loading
 * @param props.children - JSX element or async function returning JSX
 * @param props.as - HTML element to wrap content (default: "div")
 * @returns JSX element with suspense boundary
 */
export const Suspense = ({
  fallback,
  as: As = "div",
  children,
  ...props
}: SuspenseProps): JSX.Element => {
  const id = `suspense-${crypto.randomUUID()}`;

  let promise: Promise<[id: string, html: string]> | undefined;
  if (typeof children === "function") {
    promise = children().then(async (el) => [id, await (await el).toPromise()]);
  } else {
    promise = (async () => [id, await (await children).toPromise()])();
  }

  suspended.set(id, promise);

  return (
    <As id={id} {...props}>
      {fallback}
    </As>
  );
};

type ResolveProps = {
  nonce?: string;
};

/**
 * Resolve component that injects the necessary scripts and templates for Suspense to work.
 * Must be placed after all Suspense components in the document.
 *
 * @param props - Component props
 * @param props.nonce - Optional nonce for Content Security Policy
 * @returns JSX element with scripts and templates for progressive rendering
 */
export const Resolve = ({ nonce }: ResolveProps): JSX.Element => {
  if (suspended.size === 0) {
    return <></>;
  }

  return into(
    (async function* () {
      const nonceAttribute = nonce ? ` nonce="${nonce}"` : "";
      yield* `
<script type="application/javascript"${nonceAttribute}>

class ResolvedData extends HTMLElement {
  connectedCallback() {
    const templateId = this.getAttribute('from');
    const targetId = this.getAttribute('to');
    const template = document.getElementById(templateId);
    const target = document.getElementById(targetId);
    if (template instanceof HTMLTemplateElement && target instanceof HTMLElement) {
      target.replaceWith(template.content.cloneNode(true));
    }

    this.remove();
    template?.remove();
  }
}

customElements.define('resolved-data', ResolvedData);
</script>
`;

      while (suspended.size > 0) {
        const templateId = crypto.randomUUID();
        const [id, element] = await Promise.race(suspended.values());
        suspended.delete(id);
        yield* `
<template id="${templateId}">${element}</template>
<resolved-data to="${id}" from="${templateId}">
</resolved-data>`;
      }
    })(),
  );
};
