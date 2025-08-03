import { generateRouter } from "./generate-router.mts";
import { generateTypes } from "./generate-types.mts";

export const generate = async (appFolder: string): Promise<void> => {
  console.log("Generating router for", appFolder);
  await generateRouter(appFolder);
  console.log("Generating types for", appFolder);
  await generateTypes(appFolder);
};
