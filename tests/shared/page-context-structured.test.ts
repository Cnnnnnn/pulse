import { describe, expect, it } from "vitest";
import {
  buildPageContextEntities,
  formatPageEntitiesForPrompt,
} from "../../src/shared/page-context-structured";

describe("page-context-structured", () => {
  it("formatPageEntitiesForPrompt emits JSON and id hint", () => {
    const entities = buildPageContextEntities({
      activeNav: "movies",
      route: "movies",
      selection: {
        movie: { id: "m1", title: "八仙" },
      },
      visibleMovies: [{ id: "m1", title: "八仙", index: 1 }],
    });
    const block = formatPageEntitiesForPrompt(entities);
    expect(block).toContain("pageEntities=");
    expect(block).toContain('"id":"m1"');
    expect(block).toContain("visibleMovies");
    expect(block).toContain("movie.id");
  });
});
