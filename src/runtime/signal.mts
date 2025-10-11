/**
 * Shared symbol used to mark Squarehole client signals at render time.
 * Both the JSX runtime and client helpers use this to cooperate without a direct import cycle.
 */
export const SIGNAL: unique symbol = Symbol.for("@mewhhaha/squarehole.signal");

