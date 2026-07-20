/**
 * src/renderer/games/CollectionSidebar.jsx
 *
 * 收藏侧栏：文件夹（含目标进度条）+ 标签（含已收数），点击即筛选。
 * 支持新建 / 重命名 / 设目标 / 删除（保留条目 | 一并移除）。纯本地。
 *
 * 可访问性：按钮均有焦点环；状态辅以文字；数值 tabular-nums；≥44px 触控热区。
 */
import { useMemo, useState } from "preact/hooks";
import {
  folders,
  tags,
  wishlist,
  activeCollectionFilter,
  setCollectionFilter,
  createFolder,
  renameFolder,
  setFolderTarget,
  deleteFolder,
  addTag,
  renameTag,
  deleteTag,
} from "./gamesStore.js";
import { ProgressBar } from "./ProgressBar.jsx";

function FolderRow({ folder, count, active, onSelect }) {
  const [menu, setMenu] = useState(null); // 'name' | 'target' | 'delete' | null
  const [draft, setDraft] = useState("");
  const hasTarget = typeof folder.target === "number" && folder.target > 0;
  const percent = hasTarget ? Math.round((count / folder.target) * 100) : null;

  function commitName() {
    const v = draft.trim();
    if (v) renameFolder(folder.id, v);
    setMenu(null);
  }
  function commitTarget() {
    const n = draft.trim() === "" ? null : Number(draft);
    setFolderTarget(folder.id, n);
    setMenu(null);
  }

  return (
    <li class={`collection-folder${active ? " is-active" : ""}`}>
      <button
        type="button"
        class="collection-folder__main"
        aria-pressed={active}
        onClick={() => onSelect(folder.id)}
      >
        <span class="collection-folder__name">{folder.name}</span>
        <span class="collection-folder__count">
          {hasTarget ? `${count}/${folder.target}` : `${count} 款`}
        </span>
      </button>

      <button
        type="button"
        class="collection-row__more"
        aria-label={`${folder.name} 更多操作`}
        aria-expanded={menu !== null}
        onClick={() => {
          setDraft("");
          setMenu(menu ? null : "name");
        }}
      >
        ⋯
      </button>

      {hasTarget && (
        <div class="collection-folder__progress">
          <ProgressBar percent={percent} label={`${count}/${folder.target}`} />
        </div>
      )}

      {menu && (
        <div class="collection-pop" role="menu">
          {menu === "name" && (
            <div class="collection-pop__edit">
              <input
                class="collection-input"
                type="text"
                value={draft || folder.name}
                placeholder="重命名"
                aria-label="重命名收藏夹"
                onInput={(e) => setDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") setMenu(null);
                }}
                ref={(el) => el && el.focus()}
              />
              <button type="button" class="collection-pop__btn" onClick={commitName}>
                保存
              </button>
            </div>
          )}
          {menu === "target" && (
            <div class="collection-pop__edit">
              <input
                class="collection-input"
                type="number"
                min="1"
                value={draft !== "" ? draft : (folder.target ?? "")}
                placeholder="目标数量（留空取消）"
                aria-label="设置目标数量"
                onInput={(e) => setDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTarget();
                  if (e.key === "Escape") setMenu(null);
                }}
                ref={(el) => el && el.focus()}
              />
              <button type="button" class="collection-pop__btn" onClick={commitTarget}>
                保存
              </button>
            </div>
          )}
          {menu === "delete" && (
            <div class="collection-pop__confirm">
              <span class="collection-pop__hint">删除收藏夹：</span>
              <button
                type="button"
                class="collection-pop__btn"
                onClick={() => {
                  deleteFolder(folder.id, { mode: "keep" });
                  setMenu(null);
                }}
              >
                保留条目
              </button>
              <button
                type="button"
                class="collection-pop__btn collection-pop__btn--danger"
                onClick={() => {
                  deleteFolder(folder.id, { mode: "remove" });
                  setMenu(null);
                }}
              >
                一并移除
              </button>
            </div>
          )}
          {menu !== "delete" && menu !== "name" && menu !== "target" && (
            <>
              <button
                type="button"
                class="collection-pop__item"
                role="menuitem"
                onClick={() => {
                  setDraft("");
                  setMenu("name");
                }}
              >
                重命名
              </button>
              <button
                type="button"
                class="collection-pop__item"
                role="menuitem"
                onClick={() => {
                  setDraft("");
                  setMenu("target");
                }}
              >
                设置目标数量
              </button>
              <button
                type="button"
                class="collection-pop__item collection-pop__item--danger"
                role="menuitem"
                onClick={() => setMenu("delete")}
              >
                删除
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function TagRow({ tag, count, active, onSelect }) {
  const [menu, setMenu] = useState(null);
  const [draft, setDraft] = useState("");

  function commitName() {
    const v = draft.trim();
    if (v && v !== tag.name) renameTag(tag.name, v);
    setMenu(null);
  }

  return (
    <li class={`collection-tag${active ? " is-active" : ""}`}>
      <button
        type="button"
        class="collection-tag__main"
        aria-pressed={active}
        onClick={() => onSelect(tag.name)}
      >
        <span class="collection-tag__name">#{tag.name}</span>
        <span class="collection-tag__count">{count}</span>
      </button>

      <button
        type="button"
        class="collection-row__more"
        aria-label={`${tag.name} 更多操作`}
        aria-expanded={menu !== null}
        onClick={() => {
          setDraft("");
          setMenu(menu ? null : "name");
        }}
      >
        ⋯
      </button>

      {menu && (
        <div class="collection-pop" role="menu">
          {menu === "name" ? (
            <div class="collection-pop__edit">
              <input
                class="collection-input"
                type="text"
                value={draft || tag.name}
                placeholder="重命名"
                aria-label="重命名标签"
                onInput={(e) => setDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") setMenu(null);
                }}
                ref={(el) => el && el.focus()}
              />
              <button type="button" class="collection-pop__btn" onClick={commitName}>
                保存
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                class="collection-pop__item"
                role="menuitem"
                onClick={() => {
                  setDraft("");
                  setMenu("name");
                }}
              >
                重命名
              </button>
              <button
                type="button"
                class="collection-pop__item collection-pop__item--danger"
                role="menuitem"
                onClick={() => {
                  deleteTag(tag.name);
                  setMenu(null);
                }}
              >
                删除（保留条目）
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function CollectionSidebar() {
  const [newFolder, setNewFolder] = useState("");
  const [newTag, setNewTag] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [addingTag, setAddingTag] = useState(false);

  const filter = activeCollectionFilter.value;

  // 单遍扫描：一次遍历 wishlist 同时算 folder + tag 计数（替代每行 .filter() 的 O(F×N + T×N)）
  const tally = useMemo(() => {
    const fc = {}; // folderId → count
    const tc = {}; // tagName → count
    for (const e of wishlist.value) {
      if (e && e.folderId) fc[e.folderId] = (fc[e.folderId] || 0) + 1;
      if (e && Array.isArray(e.tags)) {
        for (const t of e.tags) tc[t] = (tc[t] || 0) + 1;
      }
    }
    return { fc, tc };
  }, [wishlist.value]);

  function selectFolder(id) {
    if (filter.type === "folder" && filter.id === id) {
      setCollectionFilter(null, null); // 再次点击取消筛选
    } else {
      setCollectionFilter("folder", id);
    }
  }
  function selectTag(name) {
    if (filter.type === "tag" && filter.id === name) {
      setCollectionFilter(null, null);
    } else {
      setCollectionFilter("tag", name);
    }
  }

  function commitNewFolder() {
    const v = newFolder.trim();
    if (v) createFolder(v);
    setNewFolder("");
    setAddingFolder(false);
  }
  function commitNewTag() {
    const v = newTag.trim();
    if (v) addTag(v);
    setNewTag("");
    setAddingTag(false);
  }

  const allActive = filter.type === null;

  return (
    <aside class="collection-sidebar" aria-label="收藏分类">
      <div class="collection-sidebar__section">
        <div class="collection-sidebar__head">
          <h3 class="collection-sidebar__title">收藏夹</h3>
          <button
            type="button"
            class="collection-add"
            aria-label="新建收藏夹"
            onClick={() => {
              setAddingFolder((v) => !v);
              setAddingTag(false);
            }}
          >
            ＋
          </button>
        </div>

        {addingFolder && (
          <div class="collection-new">
            <input
              class="collection-input"
              type="text"
              value={newFolder}
              placeholder="收藏夹名称"
              aria-label="新建收藏夹名称"
              onInput={(e) => setNewFolder(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNewFolder();
                if (e.key === "Escape") setAddingFolder(false);
              }}
              ref={(el) => el && el.focus()}
            />
            <button type="button" class="collection-pop__btn" onClick={commitNewFolder}>
              添加
            </button>
          </div>
        )}

        <ul class="collection-list">
          <li>
            <button
              type="button"
              class={`collection-all${allActive ? " is-active" : ""}`}
              aria-pressed={allActive}
              onClick={() => setCollectionFilter(null, null)}
            >
              全部收藏
              <span class="collection-folder__count">{wishlist.value.length} 款</span>
            </button>
          </li>
          {folders.value.map((f) => (
            <FolderRow
              key={f.id}
              folder={f}
              count={tally.fc[f.id] || 0}
              active={filter.type === "folder" && filter.id === f.id}
              onSelect={selectFolder}
            />
          ))}
          {folders.value.length === 0 && !addingFolder && (
            <li class="collection-empty">还没有收藏夹</li>
          )}
        </ul>
      </div>

      <div class="collection-sidebar__section">
        <div class="collection-sidebar__head">
          <h3 class="collection-sidebar__title">标签</h3>
          <button
            type="button"
            class="collection-add"
            aria-label="新建标签"
            onClick={() => {
              setAddingTag((v) => !v);
              setAddingFolder(false);
            }}
          >
            ＋
          </button>
        </div>

        {addingTag && (
          <div class="collection-new">
            <input
              class="collection-input"
              type="text"
              value={newTag}
              placeholder="标签名称"
              aria-label="新建标签名称"
              onInput={(e) => setNewTag(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNewTag();
                if (e.key === "Escape") setAddingTag(false);
              }}
              ref={(el) => el && el.focus()}
            />
            <button type="button" class="collection-pop__btn" onClick={commitNewTag}>
              添加
            </button>
          </div>
        )}

        <ul class="collection-list">
          {tags.value.map((t) => (
            <TagRow
              key={t.id}
              tag={t}
              count={tally.tc[t.name] || 0}
              active={filter.type === "tag" && filter.id === t.name}
              onSelect={selectTag}
            />
          ))}
          {tags.value.length === 0 && !addingTag && (
            <li class="collection-empty">还没有标签</li>
          )}
        </ul>
      </div>
    </aside>
  );
}

export default CollectionSidebar;
