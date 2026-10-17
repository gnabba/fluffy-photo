import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessage } from "#/components/chat-message";
import type { PhotoUIMessage } from "#/server/chat";

type Part = PhotoUIMessage["parts"][number];

const OPENABLE_THUMBNAIL = /<button[^>]*><img[^>]*alt="bmw-rowe.jpg"/;

const rowe = {
  id: "bmw-rowe",
  fileName: "bmw-rowe.jpg",
  path: "/library/bmw-rowe.jpg",
  raceNumbers: ["98"],
};

const assistant = (parts: Part[]): PhotoUIMessage => ({
  id: "a1",
  role: "assistant",
  parts,
});

const searched: Part = {
  type: "tool-searchPhotos",
  toolCallId: "call-1",
  state: "output-available",
  input: { request: "98" },
  output: [
    { ...rowe, score: 10, sidecarText: "car_numbers: 98" },
    {
      id: "bmw-wrt",
      fileName: "bmw-wrt.jpg",
      path: "/library/bmw-wrt.jpg",
      raceNumbers: ["31"],
      score: 1,
      sidecarText: "car_numbers: 31",
    },
  ],
};

const render = (message: PhotoUIMessage) =>
  renderToStaticMarkup(<ChatMessage isStreaming={false} message={message} />);

describe("ChatMessage", () => {
  it("shows the Matches with their reasons instead of the raw Candidates", () => {
    const html = render(
      assistant([
        searched,
        {
          type: "tool-showPhotos",
          toolCallId: "call-2",
          state: "output-available",
          input: { matches: [{ id: "bmw-rowe", reason: "#98, ROWE livery" }] },
          output: [{ ...rowe, reason: "#98, ROWE livery, <b>on</b> track" }],
        },
      ])
    );

    expect(html).toContain("bmw-rowe.jpg");
    expect(html).toMatch(OPENABLE_THUMBNAIL);
    expect(html).not.toContain("bmw-wrt.jpg");
    expect(html).toContain("#98, ROWE livery, &lt;b&gt;on&lt;/b&gt; track");
  });

  it("gives the Match grid its own Selection and Export", () => {
    const html = render(
      assistant([
        searched,
        {
          type: "tool-showPhotos",
          toolCallId: "call-2",
          state: "output-available",
          input: { matches: [{ id: "bmw-rowe", reason: "#98" }] },
          output: [{ ...rowe, reason: "#98" }],
        },
      ])
    );

    expect(html).toContain('aria-label="Select bmw-rowe.jpg"');
    expect(html).toContain("Download zip (0)");
  });

  it("shows no grid when the review keeps nothing", () => {
    const html = render(
      assistant([
        searched,
        { type: "text", text: "I couldn't find any photos", state: "done" },
      ])
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("I couldn&#x27;t find any photos");
  });

  it("shows no grid for a rejected showPhotos call", () => {
    const html = render(
      assistant([
        searched,
        {
          type: "tool-showPhotos",
          toolCallId: "call-2",
          state: "output-error",
          input: { matches: [{ id: "porsche-pfaff", reason: "x" }] },
          errorText: "Not a Candidate of this Search: porsche-pfaff",
        },
      ])
    );

    expect(html).not.toContain("<img");
  });

  it("never renders Photos from the model's text", () => {
    const html = render(
      assistant([
        {
          type: "text",
          text: '![car](/api/photos/porsche-pfaff/thumb) <img src="/api/photos/porsche-pfaff/thumb">',
          state: "done",
        },
      ])
    );

    expect(html).not.toContain("<img");
  });
});
