import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleExport } = await import("#/server/handlers");
        return handleExport(request);
      },
    },
  },
});
