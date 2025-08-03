import type { JSX } from "./runtime/jsx.mts";
import { into } from "./runtime/node.mts";

const suspended = new Map<string, Promise<[id: string, html: string]>>();

type SuspenseProps<AS extends keyof JSX.IntrinsicElements = "div"> = {
  as?: AS;
  fallback: JSX.Element;
  children: JSX.Element | (() => Promise<JSX.Element>);
} & Omit<JSX.IntrinsicElements[AS], "children">;

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

/** Where the templates and the custom elements for swapping the content are defined. */
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
