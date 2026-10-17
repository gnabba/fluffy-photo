import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/photos/$id/details")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { handlePhotoDetails } = await import("#/server/handlers");
        return handlePhotoDetails(params.id);
      },
    },
  },
});
