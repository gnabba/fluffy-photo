import { createServerFn } from "@tanstack/react-start";

export const getLibraryOverview = createServerFn().handler(async () => {
  const [{ config }, { loadLibrary }] = await Promise.all([
    import("#/config"),
    import("#/server/library"),
  ]);
  const library = await loadLibrary(config.libraryDir);
  return library.overview();
});
