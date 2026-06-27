import { PageHeader } from "./PageHeader.jsx";
import { navigateTo } from "../route-store.js";

export function DiagnosticsPage() {
  return (
    <div class="diagnostics-page">
      <PageHeader title="错误诊断" subtitle="检测失败 + 网络异常 + 重试历史" />
      <div class="diagnostics-content">
        <p>检测到异常时会在这里汇总(开发中)。</p>
        <button type="button" class="btn-run-check" onClick={() => navigateTo("library")}>
          ← 返回应用库
        </button>
      </div>
    </div>
  );
}

export default DiagnosticsPage;