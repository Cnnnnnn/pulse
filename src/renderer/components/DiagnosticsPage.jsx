import { PageHeader } from "./PageHeader.jsx";

export function DiagnosticsPage() {
  return (
    <div class="diagnostics-page">
      <PageHeader title="错误诊断" subtitle="检测失败 + 网络异常 + 重试历史" />
      <div class="diagnostics-content">
        <p>TODO: 复用现有 DiagnosticsDrawer 升级到全页视图</p>
      </div>
    </div>
  );
}

export default DiagnosticsPage;