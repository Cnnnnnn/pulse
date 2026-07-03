// @vitest-environment happy-dom
/**
 * Tests for BracketTree's EtPenTags.
 *
 * Goal: prove the DOM output for matches with score.et / score.pen
 * carries the 加时/点球 tags the user expects to see.
 *
 * Background: prior commits added wc-2026.com scraper + hardcoded R32 fallback
 * that populate score.et / score.pen in the snapshot. This test renders the
 * component directly with the snapshot shape so we can confirm the tags
 * actually reach the DOM and carry the right text.
 */
import { describe, it, expect } from "vitest";
import { h } from "preact";
import { render } from "@testing-library/preact";
import { EtPenTags } from "../../src/renderer/worldcup/BracketTree.jsx";

function makeMatch(score, status = "final") {
  return { matchNum: 74, status, score };
}

describe("EtPenTags", () => {
  it("renders nothing for non-final matches (even with pen data)", () => {
    const { container } = render(<EtPenTags match={makeMatch({ ft: [1, 1], pen: [3, 4] }, "pending")} />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing when score has no et/pen", () => {
    const { container } = render(<EtPenTags match={makeMatch({ ft: [3, 2] })} />);
    expect(container.textContent).toBe("");
  });

  it("renders pen tag with score for final match (M74: pen 3:4)", () => {
    const { container } = render(
      <EtPenTags match={makeMatch({ ft: [1, 1], et: [0, 0], pen: [3, 4] })} />
    );
    expect(container.textContent).toContain("点球");
    expect(container.textContent).toContain("3:4");
    expect(container.querySelector(".bracket-card-etpen-tag")).toBeTruthy();
  });

  it("renders et tag with score for final match (M75: et 0:0 + pen 2:3)", () => {
    const { container } = render(
      <EtPenTags match={makeMatch({ ft: [1, 1], et: [0, 0], pen: [2, 3] })} />
    );
    const text = container.textContent;
    expect(text).toContain("加时");
    expect(text).toContain("0:0");
    expect(text).toContain("点球");
    expect(text).toContain("2:3");
    // Should have two tags (加时 + 点球)
    expect(container.querySelectorAll(".bracket-card-etpen-tag").length).toBe(2);
  });

  it("renders only et tag if pen missing", () => {
    const { container } = render(
      <EtPenTags match={makeMatch({ ft: [2, 2], et: [1, 0] })} />
    );
    const tags = container.querySelectorAll(".bracket-card-etpen-tag");
    expect(tags.length).toBe(1);
    expect(container.textContent).toContain("加时");
    expect(container.textContent).not.toContain("点球");
  });

  it("renders only pen tag if et missing (e.g. wc-2026 injects pen but not et)", () => {
    const { container } = render(
      <EtPenTags match={makeMatch({ ft: [1, 1], pen: [5, 4] })} />
    );
    const tags = container.querySelectorAll(".bracket-card-etpen-tag");
    expect(tags.length).toBe(1);
    expect(container.textContent).toContain("点球");
    expect(container.textContent).toContain("5:4");
    expect(container.textContent).not.toContain("加时");
  });

  it("ignores malformed score.et/score.pen arrays of wrong length", () => {
    const { container } = render(
      <EtPenTags
        match={makeMatch({ ft: [1, 1], et: [0], pen: [3, 4, 5] })}
      />
    );
    // Both arrays malformed, should render nothing
    expect(container.textContent).toBe("");
  });
});
