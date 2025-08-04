/**
 * @module
 * 
 * File-system based routing generator for Squarehole applications.
 * Automatically generates routes and TypeScript types from your file structure.
 * 
 * @example
 * ```typescript
 * import { generate } from "@mewhhaha/squarehole/fs-routes";
 * 
 * // Generate routes from the app folder
 * await generate("./app");
 * ```
 */

import { generateRouter } from "./generate-router.mts";
import { generateTypes } from "./generate-types.mts";

/**
 * Generates router and TypeScript types from a file-system based route structure.
 * 
 * @param appFolder - Path to the folder containing route files
 * @returns Promise that resolves when generation is complete
 */
export const generate = async (appFolder: string): Promise<void> => {
  console.log("Generating router for", appFolder);
  await generateRouter(appFolder);
  console.log("Generating types for", appFolder);
  await generateTypes(appFolder);
};
