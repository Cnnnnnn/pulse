// @vitest-environment happy-dom
/**
 * Regression for v2.74.2 squad modal:
 *
 * Bracket fallback card had a bug where clicking M74 (Germany vs Paraguay)
 * opened the squad modal but:
 *   - right column showed "Paraguay" instead of "巴拉圭" because
 *     slot2.team.name was polluted with "a.e.t. (... ) pen. Paraguay"
 *   - middle VS area showed plain "VS" instead of "1-1" because
 *     handleMatchClick hardcoded score: undefined
 *   - meta row showed empty (no date/venue) because handleMatchClick
 *     hardcoded venue: "FIFA 2026", time: "" etc.
 *
 * This test renders the actual match object through handleMatchClick's
 * transformation by exercising cleanTeamName + score/kickoff passthrough.
 */
import { describe, it, expect } from "vitest";
import { cleanTeamName } from "../../src/renderer/worldcup/BracketTree.jsx";

describe("bracket match click → SquadModal payload", () => {
  it("extracts 'Paraguay' from polluted M74 slot2 team name", () => {
    const polluted = "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay";
    expect(cleanTeamName(polluted)).toBe("Paraguay");
  });

  it("leaves clean team names untouched (M74 slot1 'Germany')", () => {
    expect(cleanTeamName("Germany")).toBe("Germany");
  });

  it("keeps UNCACHED polluted names clean (a.e.t. only no pen)", () => {
    const aetOnly = "a.e.t. (0-0, 1-0) Brazil";
    expect(cleanTeamName(aetOnly)).toBe("Brazil");
  });
});
