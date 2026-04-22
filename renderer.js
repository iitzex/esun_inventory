const inventoryBody = document.getElementById('inventory-body');
const statsGrid = document.getElementById('stats-container');

let currentRows = [];
let sortConfig = { key: null, direction: 'asc' };
let isHomeLoading = false;

const ToonParser = {
    parse(text) {
        if (!text) return {};
        const lines = text.split(/\r?\n/);
        const root = {};
        const stack = [{ level: -1, obj: root }];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || !line.trim()) continue;

            const indent = line.search(/\S/);
            const trimmedLine = line.trim();
            const isListItem = trimmedLine.startsWith('-');

            let key = null, value = null;
            const colonIndex = trimmedLine.indexOf(':');

            if (colonIndex !== -1) {
                key = trimmedLine.substring(0, colonIndex).trim();
                value = trimmedLine.substring(colonIndex + 1).trim();
                if (isListItem) key = key.substring(1).trim();
            } else if (isListItem) {
                value = trimmedLine.substring(1).trim();
            } else {
                value = trimmedLine;
            }

            while (stack.length > 1 && indent <= stack[stack.length - 1].level) {
                stack.pop();
            }

            const parent = stack[stack.length - 1].obj;

            if (isListItem) {
                let newObj = {};
                if (key) {
                    newObj[key] = this._parseVal(value);
                } else if (value !== "") {
                    newObj = this._parseVal(value);
                }
                // parent is always Array here: TOON list items are only emitted
                // after a "key:\n" that pushed [] onto the stack.
                if (Array.isArray(parent)) parent.push(newObj);
                if (typeof newObj === 'object' && newObj !== null) {
                    stack.push({ level: indent, obj: newObj });
                }
            } else if (key) {
                if (value === "") {
                    let nextI = i + 1;
                    while (nextI < lines.length && !lines[nextI].trim()) nextI++;
                    const nextLineExists = nextI < lines.length;
                    const nextIndent = nextLineExists ? lines[nextI].search(/\S/) : -1;
                    const newVal = (nextLineExists && lines[nextI].trim().startsWith('-') && nextIndent > indent) ? [] : {};
                    parent[key] = newVal;
                    stack.push({ level: indent, obj: newVal });
                } else {
                    parent[key] = this._parseVal(value);
                }
            }
        }
        return root;
    },
    _parseVal(v) {
        const lower = v.toLowerCase().trim();
        if (!lower || ['nan', 'none', 'null'].includes(lower)) return null;
        if (lower === 'true') return true;
        if (lower === 'false') return false;
        if ((v.length > 1 && v.startsWith('0')) || /^\d{4}$/.test(v)) return v;
        const num = Number(v);
        return Number.isNaN(num) || v.trim() === '' ? v : num;
    }
};

const currencyFormatter = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always'
});

function formatNum(num) {
    return currencyFormatter.format(num || 0);
}

function infoRow(key, value) {
    return `<div class="info-row"><span class="info-row-key">${key}</span><span class="info-row-value">${value}</span></div>`;
}

// 把 TOON 解析後的物件 render 成卡片：dict → key-value 列、
// array of primitives → "[a, b, c]"、array of objects → #ITEM N 分組。
function renderInfoSection(title, data) {
    let html = `<div class="card card-info-section"><div class="card-label card-section-title">${title}</div><div class="info-list">`;

    const traverse = (target, prefix = '') => {
        if (target === null || typeof target !== 'object') {
            html += infoRow(prefix, target);
            return;
        }
        if (Array.isArray(target)) {
            if (target.length === 0) {
                html += '<div class="info-empty">無紀錄</div>';
                return;
            }
            if (typeof target[0] !== 'object' || target[0] === null) {
                html += infoRow(prefix, `[${target.join(', ')}]`);
                return;
            }
            target.forEach((item, idx) => {
                html += `<div class="info-item-header">#ITEM ${idx + 1}</div>`;
                traverse(item, prefix);
            });
            return;
        }
        for (const [key, val] of Object.entries(target)) {
            traverse(val, prefix ? `${prefix}.${key}` : key);
        }
    };

    traverse(data);
    html += '</div></div>';
    return html;
}

function makeButtonStateSetter(btnId, labelSelector) {
    const btn = document.getElementById(btnId);
    const label = btn.querySelector(labelSelector);
    return (state, text) => {
        btn.className = `sidebar-action ${state}`;
        label.textContent = text;
    };
}

async function handleDownload() {
    const setState = makeButtonStateSetter('sync-btn-sidebar', '.sync-label');
    setState('syncing', 'SYNCING');
    try {
        const result = await window.electronAPI.downloadInventory();
        if (result.success) {
            setState('done', 'DONE');
            await init();
        } else {
            setState('error', 'FAILED');
        }
    } catch (err) {
        setState('error', 'ERROR');
    } finally {
        setTimeout(() => setState('', 'SYNC'), 2000);
    }
}

async function exportToSelfTxt() {
    const setState = makeButtonStateSetter('export-btn-sidebar', '.export-label');

    if (!currentRows || currentRows.length === 0) {
        setState('error', 'NO DATA');
        setTimeout(() => setState('', 'EXPORT'), 2000);
        return;
    }

    setState('syncing', 'EXPORTING');
    const content = currentRows.map(row => `${row.stkNo},${row.stkNa}`).join('\n');
    try {
        const result = await window.electronAPI.saveSelfTxt(content);
        if (result.success) setState('done', 'DONE');
        else setState('error', 'FAILED');
    } catch (err) {
        setState('error', 'ERROR');
    } finally {
        setTimeout(() => setState('', 'EXPORT'), 2000);
    }
}

function switchView(viewId) {
    document.querySelectorAll('.view-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));

    const viewTitle = document.getElementById('view-title');
    const rangeSelector = document.getElementById('news-range-selector');
    rangeSelector.style.display = 'none';

    if (viewId === 'dashboard') {
        document.getElementById('dashboard-view').style.display = 'block';
        document.getElementById('nav-dashboard').classList.add('active');
        viewTitle.textContent = 'INVESTMENT OVERVIEW';
        toggleDashboard(true);
    } else if (viewId === 'wallet') {
        document.getElementById('wallet-view').style.display = 'block';
        document.getElementById('nav-wallet').classList.add('active');
        viewTitle.textContent = 'BANKING ASSETS';
    } else if (viewId === 'home') {
        document.getElementById('home-view').style.display = 'block';
        document.getElementById('nav-home').classList.add('active');
        viewTitle.textContent = 'CORE STATUS';
        loadHomeInfo();
    } else if (viewId === 'news') {
        document.getElementById('news-view').style.display = 'block';
        document.getElementById('nav-news').classList.add('active');
        viewTitle.textContent = 'TRADE ORDERS & TRANSACTIONS';
        rangeSelector.style.display = 'flex';
        loadNewsInfo();
    }
}

async function loadNewsInfo() {
    const container = document.getElementById('news-info-container');
    const range = document.getElementById('news-range-select').value;
    container.innerHTML = `<div class="card card-loading">正在同步 ${range} 交易數據...</div>`;

    try {
        const result = await window.electronAPI.getNewsInfo(range);
        if (!result.success) {
            container.innerHTML = `<div class="card card-error">獲取交易數據失敗: ${result.message}</div>`;
            return;
        }

        const data = ToonParser.parse(result.data);
        let html = '';
        if (data.orders) html += renderInfoSection('委託紀錄 (Orders)', data.orders);
        if (data.transactions) html += renderInfoSection('成交明細 (Transactions)', data.transactions);

        container.innerHTML = html || '<div class="card card-loading">今日無交易委託或成交紀錄</div>';
    } catch (err) {
        container.innerHTML = `<div class="card card-error">執行異常: ${err.message}</div>`;
    }
}

async function loadHomeInfo() {
    if (isHomeLoading) return;
    const container = document.getElementById('home-info-container');

    if (container.innerHTML.includes('正在讀取')) {
        container.innerHTML = '<div class="card card-loading">正在同步 SDK 核心數據...</div>';
    }

    isHomeLoading = true;
    try {
        const result = await window.electronAPI.getHomeInfo();
        if (!result.success) {
            container.innerHTML = `<div class="card card-error">獲取資訊失敗: ${result.message}</div>`;
            return;
        }

        const data = ToonParser.parse(result.data);
        let html = '';
        if (data.cert) html += renderInfoSection('憑證資訊 (Certificate)', data.cert);
        if (data.key) html += renderInfoSection('API 金鑰狀態 (Key Info)', data.key);
        if (data.trade_status) html += renderInfoSection('交易權限與額度 (Trade Status)', data.trade_status);

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="card card-error">執行異常: ${err.message}</div>`;
    } finally {
        isHomeLoading = false;
    }
}

function toggleDashboard(forceOpen = false) {
    const menu = document.getElementById('sidebar-date-menu');
    const chevron = document.getElementById('dashboard-chevron');
    if (forceOpen) {
        menu.classList.add('show');
    } else {
        menu.classList.toggle('show');
    }
    const isOpen = menu.classList.contains('show');
    chevron.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
}

function handleDashboardClick() {
    const isActive = document.getElementById('nav-dashboard').classList.contains('active');
    if (isActive) {
        toggleDashboard();
    } else {
        switchView('dashboard');
    }
}

async function init() {
    const files = await window.electronAPI.listInventory();
    const menu = document.getElementById('sidebar-date-menu');
    menu.innerHTML = '';

    const groups = {};
    files.forEach(file => {
        const yearMonth = file.substring(0, 6);
        if (!groups[yearMonth]) groups[yearMonth] = [];
        groups[yearMonth].push(file);
    });

    const sortedMonths = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    sortedMonths.forEach((month, idx) => {
        const label = document.createElement('div');
        label.className = 'month-label';
        label.textContent = `${month.substring(0,4)}年 ${month.substring(4,6)}月`;
        menu.appendChild(label);

        groups[month].forEach(file => {
            const dateStr = file.replace('.toon', '');
            const formattedDate = `${dateStr.substring(0,4)}/${dateStr.substring(4,6)}/${dateStr.substring(6,8)}`;
            const item = document.createElement('div');
            item.className = 'sub-item';
            item.textContent = formattedDate;
            item.onclick = (e) => {
                e.stopPropagation();
                selectDate(file, item);
            };
            menu.appendChild(item);
            if (idx === 0 && groups[month][0] === file) {
                selectDate(file, item);
                menu.classList.add('show');
            }
        });
    });
}

async function selectDate(filename, element) {
    document.querySelectorAll('.sub-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    const toonText = await window.electronAPI.readInventory(filename);
    if (!toonText) {
        processData(null);
        renderBankBalance(null);
        return;
    }
    const dataObj = ToonParser.parse(toonText);
    processData(dataObj.inventory);
    renderBankBalance(dataObj.balance);
    renderSettlements(dataObj.settlements);

    switchView('dashboard');
}

function renderBankBalance(data) {
    if (!data || Object.keys(data).length === 0) return;
    const exchange = data.exchange_balance ?? data.exange_balance ?? 0;
    document.getElementById('bank-available').textContent = `$${formatNum(data.available_balance)}`;
    document.getElementById('bank-exchange').textContent = `$${formatNum(exchange)}`;
    document.getElementById('bank-reserved').textContent = `$${formatNum(data.stock_pre_save_amount)}`;
}

function renderSettlements(settlements) {
    const container = document.getElementById('settlements-container');
    if (!settlements || !Array.isArray(settlements) || settlements.length === 0) {
        container.innerHTML = '<div class="card card-loading">目前無待交割款項</div>';
        return;
    }

    const fmtDate = (raw) => {
        const s = String(raw || '');
        return s.length === 8 ? `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)}` : (s || '—');
    };

    let html = '';
    settlements.forEach(item => {
        // API 欄位：c_date=交割日, date=成交日, price=應收金額（正=應收，負=應付）
        const settlementDate = fmtDate(item.c_date);
        const tradeDate = fmtDate(item.date);
        const amount = parseFloat(item.price) || 0;
        const isReceivable = amount >= 0;
        const sign = isReceivable ? '+' : '-';
        const typeLabel = isReceivable ? '應收' : '應付';
        const tone = isReceivable ? 'receivable' : 'payable';

        html += `
            <div class="card settlement-card ${tone}">
                <div class="settlement-meta">
                    <div class="settlement-date-label">交割日 ${settlementDate}</div>
                    <div class="settlement-type">${typeLabel}</div>
                    <div class="settlement-trade-date">成交日 ${tradeDate}</div>
                </div>
                <div class="settlement-amount">${sign}$${formatNum(Math.abs(amount))}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function processData(inventoryList) {
    if (!inventoryList || !Array.isArray(inventoryList)) {
        inventoryBody.innerHTML = '<tr><td colspan="8" class="center">目前無庫存資料</td></tr>';
        currentRows = [];
        render();
        return;
    }
    currentRows = inventoryList.map(row => ({
        stkNo: row.stk_no || 'N/A',
        stkNa: row.stk_na || '未知股票',
        qty: parseFloat(row.qty_l) || 0,
        avgPrice: parseFloat(row.price_avg) || 0,
        nowPrice: parseFloat(row.price_now) || 0,
        mktValue: parseFloat(row.rec_va_sum) || 0,
        plSum: parseFloat(row.make_a_sum) || 0,
        per: parseFloat(row.make_a_per) || 0,
        details: Array.isArray(row.stk_dats) ? row.stk_dats : [],
        costRaw: Math.abs(parseFloat(row.cost_sum || 0))
    })).filter(r => r.stkNo !== 'N/A');
    render();
}

function setSort(key) {
    if (sortConfig.key === key) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    else { sortConfig.key = key; sortConfig.direction = 'asc'; }
    document.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('onclick')?.includes(`'${key}'`)) th.classList.add(sortConfig.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    });
    currentRows.sort((a, b) => {
        let valA = a[key], valB = b[key];
        if (typeof valA === 'string') return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });
    render();
}

function render() {
    let totalMkt = 0, totalCost = 0, totalPL = 0;
    inventoryBody.innerHTML = '';
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
            <td class="center"><button class="btn-detail" onclick="toggleDetails(${idx})">明細</button></td>
        `;
        fragment.appendChild(tr);
        if (data.details && data.details.length > 0) {
            const dTr = document.createElement('tr');
            dTr.id = `detail-${idx}`; dTr.className = 'details-row';
            dTr.innerHTML = `<td colspan="8"><div id="detail-content-${idx}" class="details-container">載入中...</div></td>`;
            fragment.appendChild(dTr);
        }
    });
    inventoryBody.appendChild(fragment);
    const totalROI = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

    statsGrid.innerHTML = `
        <div class="card"><div class="card-label">總估計市值</div><div class="card-value">$${formatNum(totalMkt)}</div></div>
        <div class="card"><div class="card-label">合計未實現損益</div><div class="card-value ${totalPL >= 0 ? 'positive' : 'negative'}">${totalPL >= 0 ? '+' : ''}${formatNum(totalPL)}</div></div>
        <div class="card"><div class="card-label">總估計報酬率</div><div class="card-value ${totalROI >= 0 ? 'positive' : 'negative'}">${percentFormatter.format(totalROI)}%</div></div>`;
}

window.toggleDetails = (idx) => {
    const el = document.getElementById(`detail-${idx}`);
    const contentEl = document.getElementById(`detail-content-${idx}`);
    if (!el) return;
    if (el.style.display === 'table-row') {
        el.style.display = 'none';
        return;
    }
    if (contentEl.innerHTML === '載入中...') {
        const data = currentRows[idx];
        let dHtml = '';
        data.details.forEach(d => {
            const dPL = parseFloat(d.make_a || 0);
            const dClass = dPL >= 0 ? 'positive' : 'negative';
            dHtml += `<div class="detail-item">
                    <span>${d.t_date || ''}</span>
                    <span class="num">${formatNum(d.qty)}</span>
                    <span class="num">${parseFloat(d.price || 0).toFixed(2)}</span>
                    <span class="num detail-pl ${dClass}">${dPL >= 0 ? '+' : ''}${formatNum(dPL)}</span>
                </div>`;
        });
        contentEl.innerHTML = dHtml;
    }
    el.style.display = 'table-row';
};

(async () => {
    await init();
    handleDownload();
})();
