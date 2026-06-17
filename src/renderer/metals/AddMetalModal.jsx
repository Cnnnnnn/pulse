/**
 * src/renderer/metals/AddMetalModal.jsx
 *
 * Modal for adding a new metal watch OR editing an existing holding.
 * On save: computes costPriceCNY snapshot using current FX rate,
 * then persists via metalsApi.upsertHolding.
 */

import { useState, useEffect } from 'preact/hooks';
import { addModalOpen, editingMetalId, config, upsertHolding, removeHolding, fxCache } from './metalStore.js';
import { METALS, getMetalById } from '../../metals/metal-config.js';

export function AddMetalModal() {
  const editingMetal = editingMetalId.value
    ? getMetalById(editingMetalId.value)
    : null;
  const currentHolding = editingMetal ? config.value.holdings[editingMetal.id] : null;

  const [selectedMetalId, setSelectedMetalId] = useState(
    editingMetal?.id || METALS[0].id
  );
  const [quantity, setQuantity] = useState(
    currentHolding?.quantity != null ? String(currentHolding.quantity) : ''
  );
  const [costPrice, setCostPrice] = useState(
    currentHolding?.costPrice != null ? String(currentHolding.costPrice) : ''
  );
  const [costCurrency, setCostCurrency] = useState(
    currentHolding?.costCurrency || 'USD'
  );
  const [note, setNote] = useState(currentHolding?.note || '');

  const selectedMetal = getMetalById(selectedMetalId);
  const fx = fxCache.value.rate;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (editingMetal) {
      setSelectedMetalId(editingMetal.id);
      setQuantity(currentHolding?.quantity != null ? String(currentHolding.quantity) : '');
      setCostPrice(currentHolding?.costPrice != null ? String(currentHolding.costPrice) : '');
      setCostCurrency(currentHolding?.costCurrency || 'USD');
      setNote(currentHolding?.note || '');
    }
  }, [editingMetalId.value]);

  const handleSave = async () => {
    if (!selectedMetal) return;
    const qty = parseFloat(quantity);
    const price = parseFloat(costPrice);
    if (isNaN(qty) || isNaN(price)) return;

    // Compute costPriceCNY snapshot using current FX rate (frozen at save time)
    let costPriceCNY;
    if (costCurrency === 'CNY') {
      costPriceCNY = price;
    } else if (fx) {
      costPriceCNY = price * fx;
    } else {
      alert('汇率未就绪,请稍后重试');
      return;
    }

    const holding = {
      id: currentHolding?.id || crypto.randomUUID(),
      quantity: qty,
      costPrice: price,
      costCurrency,
      costPriceCNY,
      addedAt: currentHolding?.addedAt || Date.now(),
      note: note || undefined,
    };

    await upsertHolding(selectedMetal.id, holding);
    addModalOpen.value = false;
    editingMetalId.value = null;
  };

  const handleRemove = async () => {
    if (!editingMetal) return;
    await removeHolding(editingMetal.id);
    addModalOpen.value = false;
    editingMetalId.value = null;
  };

  const handleClose = () => {
    addModalOpen.value = false;
    editingMetalId.value = null;
  };

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{editingMetal ? '编辑持仓' : '添加关注'}</h3>

        <label class="modal-field">
          <span>品种</span>
          <select
            value={selectedMetalId}
            onChange={(e) => setSelectedMetalId(e.target.value)}
            disabled={!!editingMetal}
          >
            {METALS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        <label class="modal-field">
          <span>数量 ({selectedMetal?.unit})</span>
          <input
            type="number"
            step="0.01"
            value={quantity}
            onInput={(e) => setQuantity(e.target.value)}
            placeholder={selectedMetal?.unit === 'oz' ? '0.5' : '100'}
          />
        </label>

        <label class="modal-field">
          <span>成本价 ({costCurrency} / {selectedMetal?.unit})</span>
          <input
            type="number"
            step="0.0001"
            value={costPrice}
            onInput={(e) => setCostPrice(e.target.value)}
            placeholder="0.00"
          />
        </label>

        <label class="modal-field">
          <span>成本币种</span>
          <select value={costCurrency} onChange={(e) => setCostCurrency(e.target.value)}>
            <option value="USD">USD (美元)</option>
            <option value="CNY">CNY (人民币)</option>
          </select>
        </label>

        <label class="modal-field">
          <span>备注 (可选)</span>
          <input
            type="text"
            value={note}
            onInput={(e) => setNote(e.target.value)}
            placeholder="e.g. 招行积存金 2024-03"
          />
        </label>

        <div class="modal-actions">
          {editingMetal && currentHolding && (
            <button class="btn btn-ghost" onClick={handleRemove}>清除持仓</button>
          )}
          <button class="btn btn-ghost" onClick={handleClose}>取消</button>
          <button class="btn btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
