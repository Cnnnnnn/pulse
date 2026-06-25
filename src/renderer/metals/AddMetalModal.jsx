/**
 * src/renderer/metals/AddMetalModal.jsx
 *
 * v2.21 重做: 添加关注 / 编辑持仓 modal.
 * 用 .metal-modal-* 样式系统 (参考 funds 的 .fund-modal-*).
 *
 * 实时预览: 输入数量 + 成本后, 实时算出
 *   ≈ 总成本 ¥XXX · 每克成本 ¥YYY/克
 * 成本币种可选 USD/CNY; USD 时用当前汇率快照换算成 CNY 冻结.
 */

import { useState, useEffect, useMemo } from 'preact/hooks';
import {
  addModalOpen,
  editingMetalId,
  config,
  upsertHolding,
  removeHolding,
  fxCache,
} from './metalStore.js';
import { METALS, getMetalById } from '../../metals/metal-config.js';
import { BareModalShell } from '../components/ModalShell.jsx';
import { IconAlert } from '../components/icons.jsx';

const GRAM_PER_OZ = 31.1035;

function formatCNY(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

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
  const [errorMsg, setErrorMsg] = useState('');

  const selectedMetal = getMetalById(selectedMetalId);
  const fx = fxCache.value.rate;

  // Reset form when modal opens/switches metal
  useEffect(() => {
    if (editingMetal) {
      setSelectedMetalId(editingMetal.id);
      setQuantity(currentHolding?.quantity != null ? String(currentHolding.quantity) : '');
      setCostPrice(currentHolding?.costPrice != null ? String(currentHolding.costPrice) : '');
      setCostCurrency(currentHolding?.costCurrency || 'USD');
      setNote(currentHolding?.note || '');
    }
    setErrorMsg('');
  }, [editingMetalId.value]);

  // 实时预览: 把成本价换算到 ¥/克
  const preview = useMemo(() => {
    const qty = parseFloat(quantity);
    const price = parseFloat(costPrice);
    if (isNaN(qty) || isNaN(price) || !selectedMetal) return null;

    // 成本价 → 每克人民币
    let priceCNYPerGram;
    if (costCurrency === 'CNY') {
      // 国内品种本身就是 ¥/g; 国际品种按克数输入 (假设用户已折算)
      priceCNYPerGram = selectedMetal.unit === 'g' ? price : price;
    } else {
      // USD: 国际品种 oz → g 换算
      if (fx == null) return { fxMissing: true };
      priceCNYPerGram = (price * fx) / (selectedMetal.unit === 'oz' ? GRAM_PER_OZ : 1);
    }
    const totalCNY = priceCNYPerGram * qty;
    return { priceCNYPerGram, totalCNY };
  }, [quantity, costPrice, costCurrency, selectedMetal, fx]);

  const handleSave = async () => {
    setErrorMsg('');
    if (!selectedMetal) return;
    const qty = parseFloat(quantity);
    const price = parseFloat(costPrice);
    if (isNaN(qty) || qty <= 0) {
      setErrorMsg('请输入有效的数量');
      return;
    }
    if (isNaN(price) || price <= 0) {
      setErrorMsg('请输入有效的成本价');
      return;
    }

    // Compute costPriceCNY snapshot using current FX rate (frozen at save time)
    let costPriceCNY;
    if (costCurrency === 'CNY') {
      costPriceCNY = selectedMetal.unit === 'g' ? price : price;
    } else if (fx) {
      costPriceCNY = (price * fx) / (selectedMetal.unit === 'oz' ? GRAM_PER_OZ : 1);
    } else {
      setErrorMsg('汇率未就绪，请稍后重试');
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

  const unitLabel = selectedMetal?.unit === 'oz' ? '盎司' : '克';

  return (
    <BareModalShell
      open
      onClose={handleClose}
      overlayClass="metal-modal-overlay"
      cardClass="metal-modal"
      usePortal
      ariaLabel={editingMetal ? '编辑持仓' : '添加关注'}
    >
      <div class="metal-modal-header">
          <h3>{editingMetal ? '编辑持仓' : '添加关注'}</h3>
          <button class="metal-modal-close" onClick={handleClose} aria-label="关闭">×</button>
        </div>

        <div class="metal-modal-body">
          <label class="metal-modal-field">
            <span class="metal-modal-label">品种</span>
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

          <div class="metal-modal-row">
            <label class="metal-modal-field">
              <span class="metal-modal-label">
                数量 ({unitLabel})
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onInput={(e) => setQuantity(e.target.value)}
                placeholder={selectedMetal?.unit === 'oz' ? '0.5' : '100'}
              />
            </label>

            <label class="metal-modal-field">
              <span class="metal-modal-label">成本币种</span>
              <select value={costCurrency} onChange={(e) => setCostCurrency(e.target.value)}>
                <option value="USD">USD 美元</option>
                <option value="CNY">CNY 人民币</option>
              </select>
            </label>
          </div>

          <label class="metal-modal-field">
            <span class="metal-modal-label">
              成本价 ({costCurrency} / {selectedMetal?.unit})
            </span>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={costPrice}
              onInput={(e) => setCostPrice(e.target.value)}
              placeholder="0.00"
            />
          </label>

          {preview && !preview.fxMissing && (
            <div class="metal-modal-computed">
              ≈ 每克成本 {formatCNY(preview.priceCNYPerGram)} · 总成本 {formatCNY(preview.totalCNY)}
            </div>
          )}
          {preview && preview.fxMissing && (
            <div class="metal-modal-computed metal-modal-computed-warn">
              <IconAlert size={14} /> 汇率未就绪，USD 成本暂无法换算
            </div>
          )}

          <label class="metal-modal-field">
            <span class="metal-modal-label">
              备注 <span class="metal-modal-label-optional">可选</span>
            </span>
            <input
              type="text"
              value={note}
              onInput={(e) => setNote(e.target.value)}
              placeholder="e.g. 招行积存金 2024-03"
            />
          </label>

          {errorMsg && <div class="metal-modal-error">{errorMsg}</div>}
        </div>

        <div class="metal-modal-footer">
          {editingMetal && currentHolding && (
            <button class="metal-btn metal-btn-danger" onClick={handleRemove}>清除持仓</button>
          )}
          <div class="metal-modal-footer-right">
            <button class="metal-btn metal-btn-ghost" onClick={handleClose}>取消</button>
            <button class="metal-btn metal-btn-primary" onClick={handleSave}>
              {editingMetal ? '更新' : '保存'}
            </button>
          </div>
        </div>
    </BareModalShell>
  );
}
