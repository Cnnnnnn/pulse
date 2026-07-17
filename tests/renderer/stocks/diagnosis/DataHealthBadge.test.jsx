// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { DataHealthBadge } from "../../../../src/renderer/stocks/diagnosis/DataHealthBadge.jsx";

const NOW = 1_700_000_000_000;
const recent = NOW - 1000;
const angles = ["price_trend", "volume_turnover", "valuation"];

function perAngle(map) {
  return map;
}

describe("DataHealthBadge", () => {
  it("shows N/M when partial statuses present", () => {
    const { container } = render(
      <DataHealthBadge
        perAngleData={perAngle({
          price_trend: { status: "ok", data: { x: 1 }, fetchedAt: recent },
          volume_turnover: { status: "failed", reason: "fetch_failed" },
          valuation: { status: "ok", data: { pe: 10 }, fetchedAt: recent },
        })}
        angles={angles}
        now={NOW}
      />
    );
    expect(container.textContent).toMatch(/2\s*\/\s*3/);
  });

  it("shows '全部已更新' when all ok", () => {
    const { container } = render(
      <DataHealthBadge
        perAngleData={perAngle({
          price_trend: { status: "ok", data: { x: 1 }, fetchedAt: recent },
          volume_turnover: { status: "ok", data: { x: 1 }, fetchedAt: recent },
          valuation: { status: "ok", data: { x: 1 }, fetchedAt: recent },
        })}
        angles={angles}
        now={NOW}
      />
    );
    expect(container.textContent).toMatch(/全部已更新/);
  });

  it("renders tooltip listing per-angle status", () => {
    const { container } = render(
      <DataHealthBadge
        perAngleData={perAngle({
          price_trend: { status: "ok", data: {}, fetchedAt: recent },
          volume_turnover: { status: "failed", reason: "fetch_failed" },
        })}
        angles={["price_trend", "volume_turnover"]}
        now={NOW}
      />
    );
    const tipEl = container.querySelector("[title]");
    expect(tipEl?.getAttribute("title") || "").toMatch(/价格趋势/);
    expect(tipEl?.getAttribute("title") || "").toMatch(/交易热度/);
  });

  it("returns null when perAngleData empty", () => {
    const { container } = render(<DataHealthBadge perAngleData={{}} angles={angles} now={NOW} />);
    expect(container.firstChild).toBeNull();
  });
});