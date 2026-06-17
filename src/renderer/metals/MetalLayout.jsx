/**
 * src/renderer/metals/MetalLayout.jsx
 *
 * Top-level layout for the metals tab: header + grid + modal.
 */

import { useEffect } from 'preact/hooks';
import { MetalHeader } from './MetalHeader.jsx';
import { MetalGrid } from './MetalGrid.jsx';
import { AddMetalModal } from './AddMetalModal.jsx';
import { addModalOpen, editingMetalId, initMetalStore, cleanupMetalStore } from './metalStore.js';

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
      <MetalGrid onEdit={handleEdit} />
      {addModalOpen.value && <AddMetalModal />}
    </div>
  );
}
