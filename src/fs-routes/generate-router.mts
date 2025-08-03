import { readdir, writeFile } from "node:fs/promises";
import path from "node:path/posix";
import { bySpecificity } from "./sort.mts";

const unescapedDotRegex = /(?<!\[)\.(?![^[]*\])/g;

const tsRegex = /\.ts(x)?$/;

/**
 * Generate a regex literal for a route path using named capture groups
 * Supports optional segments marked with parentheses: (segment) or ($param)
 */
const generatePatternString = (routePath: string): string => {
  const segments = routePath
    .split(unescapedDotRegex)
    .filter((value) => !value.startsWith("_"));

  if (segments.length === 0) {
    return "/";
  }

  if (segments.length === 1 && segments[0] === "$") {
    return "/*";
  }

  let pattern = "";
  for (const segment of segments) {
    const isOptional = segment.startsWith("(") && segment.endsWith(")");
    const actualSegment = isOptional ? segment.slice(1, -1) : segment;

    pattern += "/";
    if (actualSegment === "$") {
      pattern += "*";
      break;
    } else if (actualSegment.startsWith("$")) {
      const paramName = actualSegment.slice(1);
      pattern += `:${paramName}`;
      if (isOptional) pattern += "?";
    } else {
      if (isOptional) {
        pattern += `(${actualSegment})?`;
      } else {
        pattern += actualSegment;
      }
    }
  }

  return pattern;
};

export const generateRouter = async (appFolder: string): Promise<void> => {
  const routesFolder = path.join(appFolder, "routes");

  const files = await readdir(routesFolder);

  const varName = (file: string) => {
    return "$" + file.replace(tsRegex, "").replace(/[^a-zA-Z0-9]/g, "_");
  };

  const routeImports = files
    .map((file) => {
      const isDirectory = !file.endsWith(".tsx");
      const name = varName(file);
      if (isDirectory) {
        return `import * as ${name} from "./routes/${file}/route.tsx";`;
      }
      return `import * as ${name} from "./routes/${file}";`;
    })
    .join("\n");

  const routes = files
    .map((file) => file.replace(tsRegex, ""))
    .sort(bySpecificity)
    .map((file) => {
      return [file, varName(file), generatePatternString(file)] as const;
    });

  const routeVars = routes
    .map(([file, name]) => {
      const params = file
        .split(unescapedDotRegex)
        .filter((segment) => {
          // Handle optional parameters - check inside parentheses if needed
          if (segment.startsWith("(") && segment.endsWith(")")) {
            const innerSegment = segment.slice(1, -1);
            return innerSegment.startsWith("$");
          }
          return segment.startsWith("$");
        })
        .map((segment) => {
          // Extract parameter name, handling optional parameters
          if (segment.startsWith("(") && segment.endsWith(")")) {
            const innerSegment = segment.slice(1, -1);
            return `"${innerSegment.slice(1)}"`;
          }
          return `"${segment.slice(1)}"`;
        })
        .join(",");

      if (params) {
        return `const $${name} = { id: "${file}", mod: ${name}, params: [${params}] };`;
      }
      return `const $${name} = { id: "${file}", mod: ${name} };`;
    })
    .join("\n");

  const routeItems = routes
    .filter(([file]) => {
      return routes.every(([suffix]) => {
        return !suffix.startsWith(`${file}.`);
      });
    })
    .map(([file, name, pattern]) => {
      const fragments = [
        "$document",
        ...routes
          .filter(([prefix]) => file.startsWith(`${prefix}.`))
          .map(([, name]) => `$${name}`)
          .reverse(),
        `$${name}`,
      ];

      return `[new URLPattern({ pathname: ${JSON.stringify(
        pattern,
      )} }), [${fragments.join(",")}]]`;
    })
    .join(",\n");

  const file = `
import * as document from "./document.tsx";
import { type route } from "@mewhhaha/squarehole";
${routeImports}
${routeVars}
const $document = { id: "", mod: document };

export const routes: route[] = [${routeItems}];
`;

  await writeFile(path.join(appFolder, "routes.mts"), file);
};
