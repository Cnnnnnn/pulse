/**
 * src/renderer/food/FoodEmpty.jsx
 *
 * 空态 / 错误态卡片. reason: 'no_key' | 'no_location' | 'no_result' | 'error'
 */

const REASON_COPY = {
  no_key: {
    title: "请先配置高德 API key",
    body: "在 AI/集成 配置里设置高德 key 后, 才能搜索附近美食.",
    action: null,
  },
  no_location: {
    title: "请输入位置或授权定位",
    body: "输入文字地址 (如「北京·国贸」) 或点 📍 按钮授权定位.",
    action: null,
  },
  no_result: {
    title: "附近暂无美食数据",
    body: "试试扩大搜索半径, 或换个位置.",
    action: null,
  },
  error: {
    title: "附近服务暂时不可达",
    body: "请稍后重试. 详情可看右下角 toast.",
    action: null,
  },
};

export function FoodEmpty({ reason }) {
  const copy = REASON_COPY[reason] || REASON_COPY.no_location;
  return (
    <div class="food-empty">
      <div class="food-empty-icon" aria-hidden="true">🍜</div>
      <div class="food-empty-title">{copy.title}</div>
      <div class="food-empty-body">{copy.body}</div>
    </div>
  );
}

export default FoodEmpty;
