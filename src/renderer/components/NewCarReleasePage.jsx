/**
 * src/renderer/components/NewCarReleasePage.jsx
 *
 * 「新车发布」页面容器:
 *   - 顶部 header: 标题 + 副标题 + 订阅铃铛 + 刷新 + "上次更新：X 前"
 *   - KPI 概览条 (NewCarReleaseKPIs)
 *   - 筛选栏 (NewCarReleaseFilters)
 *   - 三视图 Tabs: 主列表 / 日历·时间轴
 *   - 详情视图 (点击列表/时间轴某行 → NewCarReleaseDetail)
 *
 * 数据来自 newcar-store 的 useNewCarData() (信号驱动).
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import { useNowTick } from '../hooks/useNowTick.jsx';
import { useNewCarData } from '../store/newcar-store.js';
import { NewCarReleaseKPIs } from './NewCarReleaseKPIs.jsx';
import { NewCarReleaseList } from './NewCarReleaseList.jsx';
import { NewCarReleaseCalendar } from './NewCarReleaseCalendar.jsx';
import { NewCarReleaseDetail } from './NewCarReleaseDetail.jsx';
import { NewCarReleaseFilters } from './NewCarReleaseFilters.jsx';
import { NewCarReleaseSubscribeModal } from './NewCarReleaseSubscribeModal.jsx';
import { IconBell, IconRefresh } from './icons.jsx';

/**
 * epoch ms → "X 前" (本地时区).
 */
function formatAge(ms, now) {
  if (typeof ms !== 'number' || ms <= 0) return '—';
  const diff = Math.max(0, Math.floor((now - ms) / 1000));
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export function NewCarReleasePage() {
  const data = useNewCarData();
  const now = useNowTick(30000); // 30s tick 刷新"X 前"
  const [tab, setTab] = useState('list');
  const [detail, setDetail] = useState(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  // 进入即清未读角标
  useEffect(() => {
    data.clearNavBadge();
  }, []);

  const brands = useMemo(() => {
    const s = new Set(data.releases.map((r) => r.brand));
    return [...s].sort((a, b) => a.localeCompare(b, 'zh'));
  }, [data.releases]);

  const ageLabel = useMemo(
    () => formatAge(data.lastUpdatedAt, now),
    [data.lastUpdatedAt, now],
  );

  const onRefresh = async () => {
    await data.refresh();
  };

  // 日历下钻: 选中某天 → 应用 date 筛选并切到主列表
  const handleSelectDate = (date) => {
    data.setFilters({ ...data.filters, date });
    setTab('list');
  };

  // 详情视图优先 (全屏覆盖)
  if (detail) {
    return <NewCarReleaseDetail record={detail} onBack={() => setDetail(null)} />;
  }

  return (
    <div class="newcar-page">
      <header class="newcar-header">
        <div class="newcar-header-titles">
          <h2 class="newcar-title">2026 新车发布日历</h2>
          <p class="newcar-subtitle">
            全年上市 / 预售 / 首发 / 改款 · 共 {data.releases.length} 款 · 上次更新：{ageLabel}
          </p>
        </div>
        <div class="newcar-header-actions">
          <button
            type="button"
            class="newcar-bell"
            onClick={() => setSubscribeOpen(true)}
            title="订阅提醒"
            aria-label="订阅提醒"
          >
            <IconBell size={18} />
          </button>
          <button
            type="button"
            class="newcar-refresh"
            onClick={onRefresh}
            disabled={data.loading}
          >
            <IconRefresh size={16} class={data.loading ? "is-spin" : ""} />
            {data.loading ? '刷新中…' : '刷新'}
          </button>
        </div>
      </header>

      <NewCarReleaseKPIs kpis={data.kpis} />

      <NewCarReleaseFilters
        filters={data.filters}
        brands={brands}
        onChange={data.setFilters}
      />

      <div class="newcar-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'list'}
          class={`newcar-tab${tab === 'list' ? ' is-active' : ''}`}
          onClick={() => setTab('list')}
        >
          主列表
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'calendar'}
          class={`newcar-tab${tab === 'calendar' ? ' is-active' : ''}`}
          onClick={() => setTab('calendar')}
        >
          日历 · 时间轴
        </button>
      </div>

      {tab === 'list' ? (
        <NewCarReleaseList releases={data.filtered} onOpen={setDetail} />
      ) : (
        <NewCarReleaseCalendar
          releases={data.releases}
          onSelectDate={handleSelectDate}
          onOpen={setDetail}
        />
      )}

      {subscribeOpen && (
        <NewCarReleaseSubscribeModal onClose={() => setSubscribeOpen(false)} />
      )}
    </div>
  );
}

export default NewCarReleasePage;
