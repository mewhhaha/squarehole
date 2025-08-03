import type { PluginOption } from "vite";
import { generate } from "./fs-routes/js.mts";
import path from "node:path";

export interface SquareholePluginOptions {
  /**
   * The folder containing the route files (e.g., "./app")
   */
  appFolder?: string;
  /**
   * Whether to fix import.meta.url references in the build output
   * @default true
   */
  fixImportMeta?: boolean;
}

/**
 * Combined Vite plugin for @mewhhaha/squarehole that:
 * - Watches for route file changes and regenerates routes
 * - Fixes import.meta.url references in the build output
 */
export const squarehole = (
  options: SquareholePluginOptions = {},
): PluginOption => {
  const { appFolder = "./app", fixImportMeta = true } = options;

  return {
    name: "vite-plugin-squarehole",

    // Development: Watch for route changes
    configureServer(server) {
      // Generate routes on server start
      generate(appFolder);

      // Watch for file changes and regenerate routes
      server.watcher.on("all", (event, file) => {
        // Skip change events (only care about add/unlink)
        if (event === "change") return;

        // Check if the file is in the app folder
        const resolvedAppPath = path.resolve(appFolder);
        const resolvedFilePath = path.resolve(file);

        if (resolvedFilePath.startsWith(resolvedAppPath)) {
          generate(appFolder);
        }
      });
    },

    // Build: Fix import.meta.url references
    renderChunk(code) {
      if (!fixImportMeta) return code;

      // Replace import.meta.url with a static string
      // This prevents runtime errors when import.meta.url is undefined
      return code.replaceAll(/import\.meta\.url/g, '"file://"');
    },
  };
};
