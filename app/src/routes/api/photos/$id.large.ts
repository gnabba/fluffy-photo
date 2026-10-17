import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/photos/$id/large")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { handlePhotoImage } = await import("#/server/handlers");
        return handlePhotoImage(params.id, "large");
      },
    },
  },
});
