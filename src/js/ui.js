import { formatNum, formatSignedNum, formatSignedPercent, percentFormatter } from './parser.js';
import { diffSummaries } from './data.js';

const inventoryBody = document.getElementById('inventory-body');
const statsGrid = document.getElementById('stats-container');
const historyPanel = document.getElementById('history-panel');
const changesPanel = document.getElementById('changes-panel');

export function buildSparkline(points) {
    const values = points.map((p) => Number(p.value) || 0);
    if (values.length === 0) return '';

    const width = 320, height = 72, padding = 6;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const coords = values.map((v, i) => [
        padding + (i * (width - padding * 2)) / Math.max(values.length - 1, 1),
        height - padding - ((v - min) / range) * (height - padding * 2),
    ]);

    const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
    const areaPath = `${linePath} L ${coords[coords.length - 1][0]} ${height - padding} L ${coords[0][0]} ${height - padding} Z`;

    return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <path class="sparkline-area" d="${areaPath}"></path>
        <path d="${linePath}"></path>
    </svg>`;
}

export function infoRow(key, value) {
    return `<div class="info-row"><span class="info-row-key">${key}</span><span class="info-row-value">${value}</span></div>`;
}

export function renderInfoSection(title, data) {
    let html = `<div class="card card-info-section"><div class="card-label card-section-title">${title}</div><div class="info-list">`;

    const traverse = (target, prefix = '') => {
        if (target === null || typeof target !== 'object') { html += infoRow(prefix, target); return; }
        if (Array.isArray(target)) {
            if (target.length === 0) { html += '<div class="info-empty">無紀錄</div>'; return; }
            if (typeof target[0] !== 'object' || target[0] === null) { html += infoRow(prefix, `[${target.join(', ')}]`); return; }
            target.forEach((item, idx) => { html += `<div class="info-item-header">#ITEM ${idx + 1}</div>`; traverse(item, prefix); });
            return;
        }
        for (const [key, val] of Object.entries(target)) traverse(val, prefix ? `${prefix}.${key}` : key);
    };

    traverse(data);
    html += '</div></div>';
    return html;
}

export function renderHistory(summary, history) {
    historyPanel.innerHTML = buildHistoryHTML(summary, history);
}

export function buildHistoryHTML(summary, history) {
    if (!summary || !history || history.length === 0) {
        return '<div class="card card-loading">尚無歷史快照可分析</div>';
    }

    const marketTrend = buildSparkline(history.map((item) => ({ value: item.totalMkt })));
    const profitTrend = buildSparkline(history.map((item) => ({ value: item.totalPL })));
    const start = history[0], end = history[history.length - 1];
    const marketDelta = end.totalMkt - start.totalMkt;
    const profitDelta = end.totalPL - start.totalPL;

    return `
        <div class="card insight-card">
            <div class="card-label">總市值趨勢</div>
            <div class="card-value">$${formatNum(summary.totalMkt)}</div>
            <div class="card-subvalue ${marketDelta >= 0 ? 'positive' : 'negative'}">${formatSignedNum(marketDelta)} / ${history.length} 筆快照</div>
            ${marketTrend}
            <div class="trend-footnote">${start.label} → ${end.label}</div>
        </div>
        <div class="card insight-card">
            <div class="card-label">未實現損益趨勢</div>
            <div class="card-value ${summary.totalPL >= 0 ? 'positive' : 'negative'}">${formatSignedNum(summary.totalPL)}</div>
            <div class="card-subvalue ${profitDelta >= 0 ? 'positive' : 'negative'}">${formatSignedNum(profitDelta)} / 區間變化</div>
            ${profitTrend}
            <div class="trend-footnote">目前報酬率 ${formatSignedPercent(summary.roi)}</div>
        </div>
        <div class="card insight-card">
            <div class="card-label">部位結構</div>
            <div class="card-value">${formatNum(summary.positionCount)}</div>
            <div class="card-subvalue">檔 / 淨流動性 $${formatNum(summary.netLiquidity)}</div>
            <div class="delta-list">
                <div class="delta-row"><span class="delta-label">可用餘額</span><span class="delta-value">$${formatNum(summary.availableBalance)}</span></div>
                <div class="delta-row"><span class="delta-label">今日票交</span><span class="delta-value">$${formatNum(summary.exchangeBalance)}</span></div>
                <div class="delta-row"><span class="delta-label">圈存金額</span><span class="delta-value">$${formatNum(summary.reservedBalance)}</span></div>
            </div>
        </div>`;
}

function renderChangeRows(title, items, formatter) {
    if (!items || items.length === 0) {
        return `<div class="rank-row"><span class="rank-label">${title}</span><span class="rank-value">無</span></div>`;
    }
    return items.map((item) => formatter(title, item)).join('');
}

export function renderChanges(current, previous) {
    changesPanel.innerHTML = buildChangesHTML(current, previous);
}

export function buildChangesHTML(current, previous) {
    if (!current) return '<div class="card card-loading">請先選擇一筆快照</div>';
    if (!previous) return `<div class="card card-loading">${current.label} 沒有更早的快照，暫時無法比較前一日差異</div>`;

    const diff = diffSummaries(current, previous);
    const movers = diff.changed.slice(0, 5);

    return `
        <div class="card insight-card">
            <div class="card-label">整體變化</div>
            <div class="card-value ${diff.totalPLDelta >= 0 ? 'positive' : 'negative'}">${formatSignedNum(diff.totalPLDelta)}</div>
            <div class="card-subvalue">${previous.label} → ${current.label}</div>
            <div class="delta-list">
                <div class="delta-row"><span class="delta-label">總市值變動</span><span class="delta-value ${diff.totalMktDelta >= 0 ? 'positive' : 'negative'}">${formatSignedNum(diff.totalMktDelta)}</span></div>
                <div class="delta-row"><span class="delta-label">報酬率變動</span><span class="delta-value ${diff.totalRoiDelta >= 0 ? 'positive' : 'negative'}">${formatSignedPercent(diff.totalRoiDelta)}</span></div>
                <div class="delta-row"><span class="delta-label">持股檔數變動</span><span class="delta-value">${diff.totalPositionDelta >= 0 ? '+' : ''}${diff.totalPositionDelta}</span></div>
            </div>
        </div>
        <div class="card insight-card">
            <div class="card-label">庫存異動</div>
            <div class="card-value">${diff.added.length + diff.removed.length + diff.qtyChanged.length}</div>
            <div class="card-subvalue">新增 ${diff.added.length} / 減少 ${diff.removed.length} / 調整 ${diff.qtyChanged.length}</div>
            <div class="rank-list">
                ${renderChangeRows('新增持股', diff.added.slice(0, 2), (_t, item) => `
                    <div class="rank-row"><span><span class="rank-label">${_t}</span><span class="rank-meta">${item.stkNa} ${item.stkNo}</span></span><span class="rank-value">+${formatNum(item.qty)}</span></div>`)}
                ${renderChangeRows('移除持股', diff.removed.slice(0, 2), (_t, item) => `
                    <div class="rank-row"><span><span class="rank-label">${_t}</span><span class="rank-meta">${item.stkNa} ${item.stkNo}</span></span><span class="rank-value">-${formatNum(item.qty)}</span></div>`)}
            </div>
        </div>
        <div class="card insight-card">
            <div class="card-label">損益變動最大</div>
            <div class="card-value">${movers.length}</div>
            <div class="card-subvalue">依未實現損益變動排序</div>
            <div class="rank-list">
                ${renderChangeRows('部位', movers, (_t, item) => `
                    <div class="rank-row">
                        <span><span class="rank-label">${item.stkNa}</span><span class="rank-meta">${item.stkNo} / 股數 ${formatSignedNum(item.qtyDelta)} / 前 ${formatNum(item.prevQty)} → 現 ${formatNum(item.currQty)}</span></span>
                        <span class="rank-value ${item.plDelta >= 0 ? 'positive' : 'negative'}">${formatSignedNum(item.plDelta)}</span>
                    </div>`)}
            </div>
        </div>`;
}

export function renderBankBalance(data) {
    const staleEl = document.getElementById('bank-staleness');
    const setStaleness = (isLatest) => {
        if (!staleEl) return;
        staleEl.style.display = isLatest ? 'none' : 'block';
        if (!isLatest) staleEl.textContent = '此快照的餘額非最新資料（is_latest_data = False），可能為休市或延遲資料';
    };

    if (!data || Object.keys(data).length === 0) {
        setStaleness(true);
        document.getElementById('bank-available').textContent = '--';
        document.getElementById('bank-exchange').textContent = '--';
        document.getElementById('bank-reserved').textContent = '--';
        return;
    }
    const exchange = data.exchange_balance ?? data.exange_balance ?? 0;
    document.getElementById('bank-available').textContent = `$${formatNum(data.available_balance)}`;
    document.getElementById('bank-exchange').textContent = `$${formatNum(exchange)}`;
    document.getElementById('bank-reserved').textContent = `$${formatNum(data.stock_pre_save_amount)}`;
    setStaleness(data.is_latest_data !== false);
}

export function renderSettlements(settlements) {
    const container = document.getElementById('settlements-container');
    if (!settlements || !Array.isArray(settlements) || settlements.length === 0) {
        container.innerHTML = '<div class="card card-loading">目前無待交割款項</div>';
        return;
    }

    const fmtDate = (raw) => {
        const s = String(raw || '');
        return s.length === 8 ? `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)}` : (s || '—');
    };

    container.innerHTML = settlements.map((item) => {
        const amount = parseFloat(item.price) || 0;
        const isReceivable = amount >= 0;
        return `<div class="card settlement-card ${isReceivable ? 'receivable' : 'payable'}">
            <div class="settlement-meta">
                <div class="settlement-date-label">交割日 ${fmtDate(item.c_date)}</div>
                <div class="settlement-type">${isReceivable ? '應收' : '應付'}</div>
                <div class="settlement-trade-date">成交日 ${fmtDate(item.date)}</div>
            </div>
            <div class="settlement-amount">${isReceivable ? '+' : '-'}$${formatNum(Math.abs(amount))}</div>
        </div>`;
    }).join('');
}

export function render(currentRows) {
    let totalMkt = 0, totalCost = 0, totalPL = 0;
    const fragment = document.createDocumentFragment();

    currentRows.forEach((data, idx) => {
        totalMkt += data.mktValue; totalCost += data.costRaw; totalPL += data.plSum;
        const tr = document.createElement('tr');
        const plClass = data.plSum >= 0 ? 'positive' : 'negative';
        const perClass = data.per >= 0 ? 'positive' : 'negative';
        tr.innerHTML = `
            <td><div class="stock-name">${data.stkNa}</div><div class="stock-id">${data.stkNo}</div></td>
            <td class="num">${formatNum(data.qty)}</td>
            <td class="num">${data.avgPrice.toFixed(2)}</td>
            <td class="num">${data.nowPrice.toFixed(2)}</td>
            <td class="num num-strong">${formatNum(data.mktValue)}</td>
            <td class="num ${plClass}">${data.plSum >= 0 ? '+' : ''}${formatNum(data.plSum)}</td>
            <td class="num ${perClass}">${percentFormatter.format(data.per)}%</td>
            <td class="center"><button class="btn-detail" data-idx="${idx}">明細</button></td>`;
        fragment.appendChild(tr);

        if (data.details && data.details.length > 0) {
            const dTr = document.createElement('tr');
            dTr.id = `detail-${idx}`; dTr.className = 'details-row';
            dTr.innerHTML = `<td colspan="8"><div id="detail-content-${idx}" class="details-container">載入中...</div></td>`;
            fragment.appendChild(dTr);
        }
    });

    inventoryBody.innerHTML = '';
    inventoryBody.appendChild(fragment);

    const totalROI = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
    statsGrid.innerHTML = `
        <div class="card"><div class="card-label">總估計市值</div><div class="card-value">$${formatNum(totalMkt)}</div></div>
        <div class="card"><div class="card-label">合計未實現損益</div><div class="card-value ${totalPL >= 0 ? 'positive' : 'negative'}">${totalPL >= 0 ? '+' : ''}${formatNum(totalPL)}</div></div>
        <div class="card"><div class="card-label">總估計報酬率</div><div class="card-value ${totalROI >= 0 ? 'positive' : 'negative'}">${percentFormatter.format(totalROI)}%</div></div>`;
}

export function toggleDetails(idx, currentRows) {
    const el = document.getElementById(`detail-${idx}`);
    const contentEl = document.getElementById(`detail-content-${idx}`);
    const btn = document.querySelector(`.btn-detail[data-idx="${idx}"]`);
    if (!el) return;
    if (el.style.display === 'table-row') {
        el.style.display = 'none';
        if (btn) btn.textContent = '明細';
        return;
    }
    if (contentEl.innerHTML === '載入中...') {
        const data = currentRows[idx];
        contentEl.innerHTML = data.details.map((d) => {
            const dPL = parseFloat(d.make_a || 0);
            return `<div class="detail-item">
                <span>${d.t_date || ''}</span>
                <span class="num">${formatNum(d.qty)}</span>
                <span class="num">${parseFloat(d.price || 0).toFixed(2)}</span>
                <span class="num detail-pl ${dPL >= 0 ? 'positive' : 'negative'}">${dPL >= 0 ? '+' : ''}${formatNum(dPL)}</span>
            </div>`;
        }).join('');
    }
    el.style.display = 'table-row';
    if (btn) btn.textContent = '收起';
}
