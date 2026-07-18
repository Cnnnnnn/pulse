// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { ModuleCard } from "../../../../src/renderer/stocks/diagnosis/ModuleCard.jsx";

describe("ModuleCard with angle", () => {
  it("renders DataHealthPill when angle prop given", () => {
    const { container } = render(
      <ModuleCard
        variant="capital"
        title="🌊 资金面"
        angle={{ status: "ok", data: { x: 1 }, fetchedAt: Date.now() - 1000 }}
        body={<div>content</div>}
      />
    );
    expect(container.querySelector(".data-health-pill")).toBeTruthy();
  });

  it("renders DataHealthPill even when no body (failed state)", () => {
    const { container } = render(
      <ModuleCard
        variant="capital"
        title="🌊 资金面"
        angle={{ status: "failed", reason: "fetch_failed" }}
        empty="无数据"
      />
    );
    expect(container.querySelector(".data-health-pill")).toBeTruthy();
    expect(container.textContent).toMatch(/无数据/);
  });

  it("does NOT render DataHealthPill when angle prop missing (back-compat)", () => {
    const { container } = render(
      <ModuleCard variant="capital" title="🌊 资金面" body={<div>content</div>} />
    );
    expect(container.querySelector(".data-health-pill")).toBeFalsy();
  });
});