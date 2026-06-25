/**
 * src/renderer/funds/AddFundModal.jsx
 *
 * 添加 / 编辑持仓 Modal — 精简录入: 代码 + 金额 (+ 可选备注).
 * 名称、分类由搜索/净值接口自动推断.
 */

import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import { editingHolding, closeModal, addFund, updateFund, navCache, navSource, fetchNavForCodes } from './fundStore.js';
import { pickEffectiveNavNumber } from '../../funds/fund-nav-merge.js';
import { inferCategoryFromFtype, categoryLabel } from '../../funds/fund-category.js';
import { api } from '../api.js';
import { BareModalShell } from '../components/ModalShell.jsx';
import { TabList, Tab } from '../components/TabList.jsx';
import { IconCoin, IconBarChart } from '../components/icons.jsx';

function initialForm(holding) {
  if (holding) {
    const costNav = Number(holding.costNav);
    const shares = Number(holding.shares);
    const amount = holding._amount != null && holding._amount > 0
      ? holding._amount
      : (Number.isFinite(shares) && Number.isFinite(costNav) && costNav > 0
        ? shares * costNav
        : null);
    return {
      code: holding.code || '',
      name: holding.name || '',
      category: holding.category || 'other',
      shares: holding.shares != null ? String(holding.shares) : '',
      costNav: holding.costNav != null ? String(holding.costNav) : '',
      amount: amount != null ? String(Math.round(amount * 100) / 100) : '',
      navAtBuy: costNav > 0 ? String(costNav) : '',
      note: holding.note || '',
    };
  }
  return {
    code: '', name: '', category: 'other',
    shares: '', costNav: '',
    amount: '', navAtBuy: '',
    note: '',
  };
}

function navFromSnap(snap) {
  return pickEffectiveNavNumber(snap, navSource.value);
}

export function AddFundModal() {
  const editing = editingHolding.value;
  const [form, setForm] = useState(initialForm(editing));
  const [mode, setMode] = useState('amount');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [resolvedNav, setResolvedNav] = useState(null);
  const [resolving, setResolving] = useState(false);
  const codeRef = useRef(null);
  const amountRef = useRef(null);

  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setForm(initialForm(editing));
    setMode('amount');
    setError(null);
    setResolvedNav(null);
    setResolving(false);
    setSearchResults([]);
    setSearchError(null);
    setDropdownOpen(false);
    setTimeout(() => {
      if (editing) amountRef.current && amountRef.current.focus();
      else codeRef.current && codeRef.current.focus();
    }, 0);
  }, [editing && editing.id]);

  function onEscapeKey() {
    if (dropdownOpen) {
      setDropdownOpen(false);
      return false;
    }
  }

  function updateField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function applyFundMeta(item) {
    if (!item) return;
    setForm((prev) => ({
      ...prev,
      name: item.shortName || item.name || prev.name,
      category: item.ftype ? inferCategoryFromFtype(item.ftype) : prev.category,
    }));
    if (item.latestNav != null && item.latestNav > 0) {
      setResolvedNav(item.latestNav);
    }
  }

  const searchTimerRef = useRef(null);
  const lastQueryRef = useRef('');
  const navFetchRef = useRef(null);

  async function prefetchNav(code) {
    if (!/^\d{6}$/.test(code)) return;
    if (navFetchRef.current) clearTimeout(navFetchRef.current);
    navFetchRef.current = setTimeout(async () => {
      setResolving(true);
      try {
        const r = await fetchNavForCodes(api, [code]);
        const snap = r && r.ok && r.results ? r.results[code] : null;
        const n = navFromSnap(snap);
        if (n != null) setResolvedNav(n);
        if (snap && snap.name) {
          setForm((prev) => ({
            ...prev,
            name: prev.name || snap.name,
          }));
        }
      } catch { /* noop */ }
      finally {
        setResolving(false);
      }
    }, 150);
  }

  function handleCodeChange(value) {
    const clean = value.replace(/\D/g, '').slice(0, 6);
    updateField('code', clean);
    if (editing) return;

    if (clean.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setDropdownOpen(false);
      setResolvedNav(null);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      lastQueryRef.current = clean;
      setSearching(true);
      setSearchError(null);
      try {
        const r = await api.fundsSearch(clean);
        if (lastQueryRef.current !== clean) return;
        if (r && r.ok) {
          const results = r.results || [];
          setSearchResults(results);
          const exact = results.find((x) => x.code === clean);
          if (exact) {
            applyFundMeta(exact);
            setDropdownOpen(false);
            if (!exact.latestNav || exact.latestNav <= 0) prefetchNav(clean);
          } else if (clean.length === 6) {
            prefetchNav(clean);
            setDropdownOpen(results.length > 0);
          } else {
            setDropdownOpen(true);
          }
        } else {
          setSearchResults([]);
          setSearchError(r && r.error ? r.error : '搜索失败');
          setDropdownOpen(clean.length < 6);
          if (clean.length === 6) prefetchNav(clean);
        }
      } catch (err) {
        if (lastQueryRef.current !== clean) return;
        setSearchResults([]);
        setSearchError(err && err.message ? err.message : String(err));
        if (clean.length === 6) prefetchNav(clean);
      } finally {
        if (lastQueryRef.current === clean) setSearching(false);
      }
    }, clean.length === 6 ? 120 : 250);
  }

  function pickResult(item) {
    updateField('code', item.code);
    applyFundMeta(item);
    setDropdownOpen(false);
    setSearchResults([]);
    if (!item.latestNav || item.latestNav <= 0) prefetchNav(item.code);
  }

  function handleBackdropClick() {
    if (dropdownOpen) setDropdownOpen(false);
    closeModal();
  }

  const currentNavForCode = useMemo(() => {
    if (resolvedNav != null && resolvedNav > 0) return resolvedNav;
    if (!form.code || form.code.length !== 6) return null;
    const cache = navCache.value;
    if (!cache || !cache.data) return null;
    return navFromSnap(cache.data[form.code]);
  }, [form.code, navCache.value, resolvedNav, navSource.value]);

  const computedShares = useMemo(() => {
    if (mode !== 'amount') return null;
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const navFromInput = parseFloat(form.navAtBuy);
    const nav = (Number.isFinite(navFromInput) && navFromInput > 0) ? navFromInput : currentNavForCode;
    if (!Number.isFinite(nav) || nav <= 0) return null;
    return amount / nav;
  }, [mode, form.amount, form.navAtBuy, currentNavForCode]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const code = form.code.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('基金代码必须是 6 位数字');
      return;
    }

    let shares, costNav, usedFallbackNav = false, _amount;
    if (mode === 'amount') {
      const amount = parseFloat(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError('买入金额必须 > 0');
        return;
      }
      _amount = amount;
      const navFromInput = parseFloat(form.navAtBuy);
      let nav = null;
      if (Number.isFinite(navFromInput) && navFromInput > 0) {
        nav = navFromInput;
      } else if (currentNavForCode != null && currentNavForCode > 0) {
        nav = currentNavForCode;
        usedFallbackNav = true;
      } else {
        nav = null;
      }
      if (nav != null) {
        shares = amount / nav;
        costNav = nav;
      } else {
        shares = 0;
        costNav = 0;
      }
    } else {
      shares = parseFloat(form.shares);
      if (!Number.isFinite(shares) || shares < 0) {
        setError('份额必须 ≥ 0');
        return;
      }
      costNav = parseFloat(form.costNav);
      if (!Number.isFinite(costNav) || costNav < 0) {
        setError('成本净值必须 ≥ 0');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        code,
        name: form.name.trim() || `基金 ${code}`,
        category: form.category,
        shares,
        costNav,
        note: form.note.trim() || undefined,
        _costNavIsEstimate: usedFallbackNav || undefined,
        _amount,
      };
      const r = editing
        ? await updateFund(api, editing.id, payload)
        : await addFund(api, payload);
      if (!r.ok) {
        setError(r.error || r.reason || '保存失败');
        return;
      }
      closeModal();
    } catch (err) {
      setError(err && err.message ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const showMeta = form.name || (form.code.length === 6 && (searching || resolving));

  return (
    <BareModalShell
      open
      onClose={closeModal}
      onEscape={onEscapeKey}
      onBackdropClick={handleBackdropClick}
      overlayClass="fund-modal-overlay"
      cardClass="fund-modal"
      usePortal
      ariaLabel={editing ? '编辑持仓' : '添加持仓'}
    >
      <form class="fund-modal-form" onSubmit={handleSubmit}>
          <div class="fund-modal-header">
            <span class="fund-modal-title">
              {editing ? '编辑持仓' : '添加持仓'}
            </span>
            <button
              type="button"
              class="fund-modal-close"
              onClick={closeModal}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div class="fund-modal-body">
            <div class="fund-modal-field">
              <TabList variant="config" className="fund-mode-toggle" ariaLabel="录入方式">
                <Tab
                  variant="config"
                  className="fund-mode-toggle-btn"
                  active={mode === 'amount'}
                  onClick={() => setMode('amount')}
                >
                  <IconCoin size={14} /> 按金额
                </Tab>
                <Tab
                  variant="config"
                  className="fund-mode-toggle-btn"
                  active={mode === 'shares'}
                  onClick={() => setMode('shares')}
                >
                  <IconBarChart size={14} /> 按份额
                </Tab>
              </TabList>
            </div>

            <div class="fund-modal-field fund-modal-field-with-dropdown">
              <label class="fund-modal-label">基金代码</label>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                class="fund-modal-input"
                value={form.code}
                disabled={!!editing}
                onInput={(e) => handleCodeChange(e.currentTarget.value)}
                placeholder="000001"
                autoComplete="off"
                required
              />
              {showMeta && (
                <div class="fund-modal-resolved">
                  {searching || resolving
                    ? '识别中…'
                    : `${form.name || '基金'} · ${categoryLabel(form.category)}`}
                </div>
              )}
              {dropdownOpen && !editing && (
                <div class="fund-search-dropdown" role="listbox">
                  {searching && (
                    <div class="fund-search-dropdown-loading">搜索中…</div>
                  )}
                  {!searching && searchError && (
                    <div class="fund-search-dropdown-err">搜索失败: {searchError}</div>
                  )}
                  {!searching && !searchError && searchResults.length === 0 && (
                    <div class="fund-search-dropdown-empty">没找到匹配基金</div>
                  )}
                  {!searching && searchResults.length > 0 && (
                    <ul class="fund-search-dropdown-list">
                      {searchResults.map((item) => (
                        <li
                          key={item.code}
                          class="fund-search-dropdown-item"
                          onClick={(e) => { e.stopPropagation(); pickResult(item); }}
                          role="option"
                        >
                          <span class="fund-search-item-code">{item.code}</span>
                          <span class="fund-search-item-name">{item.shortName || item.name}</span>
                          <span class="fund-search-item-meta">
                            {item.ftype && <span class="fund-search-item-ftype">{item.ftype}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {mode === 'amount' && (
              <>
                <div class="fund-modal-row">
                  <div class="fund-modal-field">
                    <label class="fund-modal-label">买入金额 (元)</label>
                    <input
                      ref={amountRef}
                      type="number"
                      step="0.01"
                      min="0"
                      class="fund-modal-input"
                      value={form.amount}
                      onInput={(e) => updateField('amount', e.currentTarget.value)}
                      placeholder="10000"
                      required
                    />
                  </div>
                  <div class="fund-modal-field">
                    <label class="fund-modal-label">买入时净值 <span class="fund-modal-label-optional">(选填)</span></label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      class="fund-modal-input"
                      value={form.navAtBuy}
                      onInput={(e) => updateField('navAtBuy', e.currentTarget.value)}
                      placeholder={currentNavForCode ? `当前 ${currentNavForCode.toFixed(4)}` : '不填则用当前净值'}
                    />
                  </div>
                </div>
                <div class="fund-modal-computed">
                  {computedShares != null ? (
                    <>
                      ≈ <b>{computedShares.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> 份
                      {!form.navAtBuy && currentNavForCode && (
                        <span class="fund-modal-computed-tag">成本用当前净值</span>
                      )}
                    </>
                  ) : (
                    <span class="fund-modal-computed-hint">
                      {resolving ? '正在拉取净值…' : '填金额后预览份额'}
                      {!resolving && !currentNavForCode && form.code.length === 6 && (
                        <> · 可先填净值或保存后自动反推</>
                      )}
                    </span>
                  )}
                </div>
              </>
            )}

            {mode === 'shares' && (
              <div class="fund-modal-row">
                <div class="fund-modal-field">
                  <label class="fund-modal-label">份额</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    class="fund-modal-input"
                    value={form.shares}
                    onInput={(e) => updateField('shares', e.currentTarget.value)}
                    placeholder="10000.50"
                    required
                  />
                </div>
                <div class="fund-modal-field">
                  <label class="fund-modal-label">成本净值 (元/份)</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    class="fund-modal-input"
                    value={form.costNav}
                    onInput={(e) => updateField('costNav', e.currentTarget.value)}
                    placeholder="1.2345"
                    required
                  />
                </div>
              </div>
            )}

            <div class="fund-modal-field">
              <label class="fund-modal-label">备注 (可选)</label>
              <input
                type="text"
                class="fund-modal-input"
                value={form.note}
                onInput={(e) => updateField('note', e.currentTarget.value)}
                placeholder="定投扣款 - 招行"
              />
            </div>

            {error && <div class="fund-modal-error">{error}</div>}
          </div>

          <div class="fund-modal-footer">
            <button
              type="button"
              class="fund-btn fund-btn-ghost"
              onClick={closeModal}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              class="fund-btn fund-btn-primary"
              disabled={submitting}
            >
              {submitting ? '保存中…' : (editing ? '更新' : '保存')}
            </button>
          </div>
        </form>
    </BareModalShell>
  );
}

export default AddFundModal;
