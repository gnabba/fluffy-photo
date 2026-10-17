// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SelectablePhotoGrid } from "#/components/selectable-photo-grid";
import type { PhotoCard } from "#/lib/photo-card";

const photo = (id: string): PhotoCard => ({
  id,
  fileName: `${id}.jpg`,
  path: `/library/${id}.jpg`,
  raceNumbers: [],
});

const FERRARI = photo("ferrari-lmcorsa");
const PORSCHE = photo("porsche-gt3");
const BMW = photo("bmw-wrt");

afterEach(cleanup);

const renderTwoGrids = () =>
  render(
    <>
      <section aria-label="first">
        <SelectablePhotoGrid photos={[FERRARI, PORSCHE, BMW]} />
      </section>
      <section aria-label="second">
        <SelectablePhotoGrid photos={[FERRARI, PORSCHE]} />
      </section>
    </>
  );

const DOWNLOAD_ZIP = /download zip/i;

const grid = (name: string) => within(screen.getByRole("region", { name }));

const downloadOf = (name: string) =>
  grid(name).queryByRole("link", { name: DOWNLOAD_ZIP });

describe("SelectablePhotoGrid", () => {
  it("has nothing to download until a Photo is ticked", () => {
    renderTwoGrids();

    const button = grid("first").getByRole("button", {
      name: "Download zip (0)",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(downloadOf("first")).toBeNull();
  });

  it("downloads an Export of exactly the ticked Photos", async () => {
    const user = userEvent.setup();
    renderTwoGrids();

    await user.click(
      grid("first").getByRole("checkbox", {
        name: "Select ferrari-lmcorsa.jpg",
      })
    );
    await user.click(
      grid("first").getByRole("checkbox", { name: "Select bmw-wrt.jpg" })
    );

    const link = downloadOf("first");
    expect(link?.textContent).toBe("Download zip (2)");
    expect(link?.getAttribute("href")).toBe(
      "/api/export?id=ferrari-lmcorsa&id=bmw-wrt"
    );
  });

  it("keeps the Selection of each grid independent", async () => {
    const user = userEvent.setup();
    renderTwoGrids();

    await user.click(
      grid("first").getByRole("checkbox", { name: "Select porsche-gt3.jpg" })
    );

    expect(
      grid("second")
        .getByRole("checkbox", { name: "Select porsche-gt3.jpg" })
        .getAttribute("aria-checked")
    ).toBe("false");
    expect(downloadOf("second")).toBeNull();
  });

  it("selects all and none of its own Photos", async () => {
    const user = userEvent.setup();
    renderTwoGrids();

    await user.click(grid("first").getByRole("button", { name: "Select all" }));
    expect(downloadOf("first")?.textContent).toBe("Download zip (3)");
    expect(downloadOf("second")).toBeNull();

    await user.click(
      grid("first").getByRole("button", { name: "Select none" })
    );
    expect(downloadOf("first")).toBeNull();
  });

  it("unticks a Photo when its checkbox is clicked again", async () => {
    const user = userEvent.setup();
    renderTwoGrids();
    const checkbox = grid("first").getByRole("checkbox", {
      name: "Select bmw-wrt.jpg",
    });

    await user.click(checkbox);
    await user.click(checkbox);

    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    expect(downloadOf("first")).toBeNull();
  });
});
