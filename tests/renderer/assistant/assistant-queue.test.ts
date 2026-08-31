import { describe, expect, it } from "vitest";
import { buildAssistantQueueGroups } from "../../../src/renderer/assistant/assistant-queue-data";

describe("assistant queue data", () => {
  it("groups app, concert, and GitHub signals into actionable queue items", () => {
    const groups = buildAssistantQueueGroups({
      apps: [
        {
          name: "Orbit",
          installed_version: "118.0",
          latest_version: "119.0",
          has_update: true,
        },
      ],
      concerts: [
        {
          id: "concert-1",
          text: "巡回演出 · 上海站：降价 60 元",
          action: { tool: "navigate", params: { nav: "concerts" } },
        },
      ],
      github: [
        {
          id: "github-1",
          text: "pulse-core · 新 release",
          action: { tool: "navigate", params: { nav: "github" } },
        },
      ],
    });

    expect(groups.map((group) => [group.kind, group.items.length])).toEqual([
      ["apps", 1],
      ["concert", 1],
      ["github", 1],
    ]);
    expect(groups[0].items[0]).toMatchObject({
      title: "Orbit",
      subtitle: "118.0 → 119.0",
      action: { tool: "upgrade_app", params: { appName: "Orbit" } },
    });
    expect(groups[1].items[0].title).toContain("巡回演出");
    expect(groups[2].items[0].action).toEqual({
      tool: "navigate",
      params: { nav: "github" },
    });
  });

  it("omits empty groups and preserves the source detail for selected items", () => {
    const groups = buildAssistantQueueGroups({
      apps: [],
      concerts: [],
      github: [
        {
          id: "github-2",
          text: "vercel/next.js · v15.2.0",
          meta: "2 小时前",
        },
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("github");
    expect(groups[0].items[0]).toMatchObject({
      id: "github:github-2",
      title: "vercel/next.js · v15.2.0",
      meta: "2 小时前",
    });
  });
});
