import type { JSX } from "./jsx.mts";

/**
 * Internal symbol for streaming state.
 * @internal
 */
export const S: unique symbol = Symbol();

/**
 * Internal symbol for Html type identification.
 * @internal
 */
export const N: unique symbol = Symbol();

const encoder = new TextEncoder();

/**
 * Html type for streaming HTML content with async generation support.
 */
export type Html = {
  [N]: true;
  text: AsyncGenerator<string>;
  toPromise: () => Promise<string>;
  toReadableStream: () => ReadableStream<Uint8Array>;
};

async function toPromise(this: Html): Promise<string> {
  let result = "";
  for await (const chunk of this.text) {
    result += chunk;
  }
  return result;
}

function toReadableStream(this: Html): ReadableStream<Uint8Array> {
  const generator = this.text;

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Converts various inputs into an Html instance for streaming.
 * 
 * @param text - String, async generator, or promise to convert
 * @returns Html instance with streaming capabilities
 */
export const into = (
  text: string | AsyncGenerator<string> | Promise<string | JSX.Element>,
): Html => {
  let generator: AsyncGenerator<string>;

  if (text instanceof Promise) {
    generator = (async function* (): AsyncGenerator<string> {
      const res = await text;
      if (typeof res === "string") {
        yield res;
      } else {
        yield* res.text;
      }
    })();
  } else if (typeof text === "string") {
    generator = (async function* (): AsyncGenerator<string> {
      yield text;
    })();
  } else {
    generator = text;
  }

  return {
    [N]: true,
    text: generator,
    toPromise,
    toReadableStream,
  };
};

/**
 * Type guard to check if a value is an Html instance.
 * 
 * @param child - Value to check
 * @returns True if the value is Html
 */
export const isHtml = (child: unknown): child is Html => {
  return (
    typeof child === "object" &&
    child !== null &&
    N in child &&
    child[N] === true
  );
};
