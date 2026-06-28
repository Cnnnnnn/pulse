/**
 * src/renderer/metals/MetalLayout.jsx
 *
 * Phase 4 装配: 单 status bar Header + 表格 Table + 添加/编辑 Modal.
 * 删除 MetalGrid / MetalCard / MetalTrendStrip / MetalDetailTrend 的引用.
 */
import { useEffect } from 'preact/hooks';
import { MetalHeader } from './MetalHeader.jsx';
import { MetalTable } from './MetalTable.jsx';
import { AddMetalModal } from './AddMetalModal.jsx';
import {
  addModalOpen, editingMetalId,
  initMetalStore, cleanupMetalStore,
} from './metalStore.js';

export function MetalLayout() {
  useEffect(() => {
    initMetalStore();
    return () => cleanupMetalStore();
  }, []);

  const handleEdit = (metalId) => {
    editingMetalId.value = metalId;
    addModalOpen.value = true;
  };

  return (
    <div class="metals-layout">
      <MetalHeader />
      <MetalTable onEdit={handleEdit} />
      {addModalOpen.value && <AddMetalModal />}
    </div>
  );
}
