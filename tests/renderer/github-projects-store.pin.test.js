/**
 * tests/renderer/github-projects-store.pin.test.js
 *
 * 覆盖 Pin 置顶（P2）store 行为：
 *  - togglePinGithubProject 翻转 pinned 并持久化
 *  - 旧数据无 pinned 字段时按 falsy 处理，翻转为 true
 *  - 仅翻转目标项，其它项不受影响
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  githubProjects,
  togglePinGithubProject,
} from "../../src/renderer/store/github-projects-store.js";

function seed(items) {
  githubProjects.value = items.map((x) => ({
    id: x.id,
    name: x.id,
    pinned: x.pinned ?? false,
  }));
}

describe("github store · Pin 置顶", () => {
  beforeEach(() => {
    githubProjects.value = [];
  });

  it("togglePin 翻转 pinned 并写回", () => {
    seed([{ id: "a/b" }, { id: "c/d" }]);
    togglePinGithubProject("a/b");
    expect(githubProjects.value.find((p) => p.id === "a/b").pinned).toBe(true);
    expect(githubProjects.value.find((p) => p.id === "c/d").pinned).toBe(false);
  });

  it("再次 toggle 取消置顶", () => {
    seed([{ id: "a/b", pinned: true }]);
    togglePinGithubProject("a/b");
    expect(githubProjects.value[0].pinned).toBe(false);
  });

  it("旧数据无 pinned 字段翻转为 true", () => {
    githubProjects.value = [{ id: "old/repo", name: "old/repo" }];
    togglePinGithubProject("old/repo");
    expect(githubProjects.value[0].pinned).toBe(true);
  });

  it("只翻转目标项，其余保持不变", () => {
    seed([{ id: "a/b", pinned: true }, { id: "c/d", pinned: true }]);
    togglePinGithubProject("c/d");
    const arr = githubProjects.value;
    expect(arr.find((p) => p.id === "a/b").pinned).toBe(true);
    expect(arr.find((p) => p.id === "c/d").pinned).toBe(false);
  });
});
