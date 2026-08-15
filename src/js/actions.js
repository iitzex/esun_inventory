import { ToonParser, formatSnapshotLabel } from './parser.js';
import { snapshotSummaryCache, createSnapshotSummary, loadSnapshotSummary, rowToPosition } from './data.js';
import { render, renderBankBalance, renderSettlements, renderHistory, renderChanges, renderInfoSection, renderMarketStatus, renderRealizedPlStats, renderTransactions, toggleDetails } from './ui.js';

const VIEW_DEFS = {
    dashboard: ['dashboard-view', 'nav-dashboard', 'INVESTMENT OVERVIEW'],
    wallet:    ['wallet-view',    'nav-wallet',    'BANKING ASSETS'],
    home:      ['home-view',      'nav-home',      'CORE STATUS'],
    news:      ['news-view',      'nav-news',      'TRADE ORDERS & TRANSACTIONS'],
};

let currentRows = [];
let sortConfig = { key: null, direction: 'asc' };
let isHomeLoading = false;
let inventoryFiles = [];

function renderLoadError(container, message) {
    container.innerHTML = `<div class="card card-error">${message}</div>`;
}

function makeButtonStateSetter(btnId) {
    const btn = document.getElementById(btnId);
    return (state, text) => {
        btn.className = `sidebar-action ${state}`.trim();
        btn.querySelector('span:first-child').textContent = text;
    };
}

const syncBtn = makeButtonStateSetter('sync-btn');
const exportBtn = makeButtonStateSetter('export-btn');

export async function handleDownload() {
    syncBtn('syncing', 'SYNCING');
    try {
        const result = await window.electronAPI.downloadInventory();
        if (result.success) { syncBtn('done', 'DONE'); await init(); }
        else syncBtn('error', 'FAILED');
    } catch { syncBtn('error', 'ERROR'); }
    finally { setTimeout(() => syncBtn('', 'SYNC'), 2000); }
}

export async function exportToSelfTxt() {
    if (!currentRows || currentRows.length === 0) {
        exportBtn('error', 'NO DATA');
        setTimeout(() => exportBtn('', 'EXPORT'), 2000);
        return;
    }
    exportBtn('syncing', 'EXPORTING');
    try {
        const result = await window.electronAPI.saveSelfTxt(currentRows.map(r => `${r.stkNo},${r.stkNa}`).join('\n'));
        exportBtn(result.success ? 'done' : 'error', result.success ? 'DONE' : 'FAILED');
    } catch { exportBtn('error', 'ERROR'); }
    finally { setTimeout(() => exportBtn('', 'EXPORT'), 2000); }
}

export function toggleDashboard(forceOpen = false) {
    const menu = document.getElementById('sidebar-date-menu');
    const chevron = document.getElementById('dashboard-chevron');
    if (forceOpen) menu.classList.add('show');
    else menu.classList.toggle('show');
    chevron.style.transform = menu.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}

export function switchView(viewId) {
    document.querySelectorAll('.view-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));

    const viewTitle = document.getElementById('view-title');
    const rangeSelector = document.getElementById('news-range-selector');
    rangeSelector.classList.add('hidden');

    const [viewEl, navEl, title] = VIEW_DEFS[viewId] || [];
    if (!viewEl) return;

    document.getElementById(viewEl).style.display = 'block';
    document.getElementById(navEl).classList.add('active');
    viewTitle.textContent = title;

    if (viewId === 'dashboard') toggleDashboard(true);
    if (viewId === 'home') { loadMarketInfo(); loadHomeInfo(); }
    if (viewId === 'news') { rangeSelector.classList.remove('hidden'); loadNewsInfo(); }
}

export async function loadMarketInfo() {
    const el = document.getElementById('market-status');
    if (!el) return;
    try {
        const result = await window.electronAPI.getMarketInfo();
        if (!result.success) { renderMarketStatus(null); return; }
        renderMarketStatus(ToonParser.parse(result.data));
    } catch { renderMarketStatus(null); }
}

export async function loadHomeInfo() {
    if (isHomeLoading) return;
    const container = document.getElementById('home-info-container');
    if (container.innerHTML.includes('正在讀取')) {
        container.innerHTML = '<div class="card card-loading">正在同步 SDK 核心數據...</div>';
    }
    isHomeLoading = true;
    try {
        const result = await window.electronAPI.getHomeInfo();
        if (!result.success) { renderLoadError(container, `獲取資訊失敗: ${result.message}`); return; }
        const data = ToonParser.parse(result.data);
        container.innerHTML = [
            data.cert && renderInfoSection('憑證資訊 (Certificate)', data.cert),
            data.key && renderInfoSection('API 金鑰狀態 (Key Info)', data.key),
            data.trade_status && renderInfoSection('交易權限與額度 (Trade Status)', data.trade_status),
        ].filter(Boolean).join('');
    } catch (err) {
        renderLoadError(container, `執行異常: ${err.message}`);
    } finally { isHomeLoading = false; }
}

export async function loadNewsInfo() {
    const container = document.getElementById('news-info-container');
    const range = document.getElementById('news-range-select').value;
    const startInput = document.getElementById('news-start').value;
    const endInput = document.getElementById('news-end').value;
    const useCustom = startInput && endInput;
    const start = useCustom ? startInput.replaceAll('-', '') : null;
    const end = useCustom ? endInput.replaceAll('-', '') : null;
    const rangeLabel = useCustom ? `${start}~${end}` : range;
    const opts = useCustom ? { start, end } : { range };

    container.innerHTML = `<div class="card card-loading">正在同步 ${rangeLabel} 交易數據...</div>`;
    try {
        const result = await window.electronAPI.getNewsInfo(opts);
        if (!result.success) { renderLoadError(container, `獲取交易數據失敗: ${result.message}`); return; }
        const data = ToonParser.parse(result.data);
        renderRealizedPlStats(data.transactions, rangeLabel);
        container.innerHTML = [
            data.orders && renderInfoSection('委託紀錄 (Orders)', data.orders),
            data.transactions && `<div class="card card-info-section"><div class="card-label card-section-title">成交明細 (Transactions)</div><div class="tx-list">${renderTransactions(data.transactions)}</div></div>`,
        ].filter(Boolean).join('') || `<div class="card card-loading">${rangeLabel} 區間無交易委託或成交紀錄</div>`;
    } catch (err) {
        renderLoadError(container, `執行異常: ${err.message}`);
    }
}

export function handleDashboardClick() {
    if (document.getElementById('nav-dashboard').classList.contains('active')) toggleDashboard();
    else switchView('dashboard');
}

async function updateInsights(selectedFile) {
    const selectedIndex = inventoryFiles.indexOf(selectedFile);
    const currentSummary = await loadSnapshotSummary(selectedFile);
    const previousSummary = selectedIndex >= 0 ? await loadSnapshotSummary(inventoryFiles[selectedIndex + 1]) : null;

    const historyStartIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const recentFiles = inventoryFiles.slice(historyStartIndex, historyStartIndex + 12).reverse();
    const recentHistory = (await Promise.all(recentFiles.map(loadSnapshotSummary))).filter(Boolean);

    renderHistory(currentSummary, recentHistory);
    renderChanges(currentSummary, previousSummary);
}

export async function selectDate(filename, element, switchToDashboard = true) {
    document.querySelectorAll('.sub-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    const toonText = await window.electronAPI.readInventory(filename);
    if (!toonText) { processData(null); renderBankBalance(null); return; }

    const dataObj = ToonParser.parse(toonText);
    snapshotSummaryCache.set(filename, createSnapshotSummary(filename, dataObj));
    processData(dataObj.inventory);
    renderBankBalance(dataObj.balance);
    renderSettlements(dataObj.settlements);
    await updateInsights(filename);
    if (switchToDashboard) switchView('dashboard');
}

function processData(inventoryList) {
    if (!inventoryList || !Array.isArray(inventoryList)) {
        document.getElementById('inventory-body').innerHTML = '<tr><td colspan="8" class="center">目前無庫存資料</td></tr>';
        currentRows = [];
        render(currentRows);
        return;
    }
    currentRows = inventoryList.map(rowToPosition).filter(r => r.stkNo !== 'N/A');
    render(currentRows);
}

export function setSort(key) {
    if (sortConfig.key === key) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    else { sortConfig.key = key; sortConfig.direction = 'asc'; }

    document.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('onclick')?.includes(`'${key}'`)) {
            th.classList.add(sortConfig.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    currentRows.sort((a, b) => {
        const [valA, valB] = [a[key], b[key]];
        if (typeof valA === 'string') return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });
    render(currentRows);
}

export async function init() {
    const files = await window.electronAPI.listInventory();
    inventoryFiles = files;
    const menu = document.getElementById('sidebar-date-menu');
    menu.innerHTML = '';
    loadMarketInfo();

    if (files.length === 0) {
        processData(null); renderBankBalance(null); renderSettlements(null);
        renderHistory(null, []); renderChanges(null, null);
        return;
    }

    const groups = {};
    files.forEach(file => {
        const ym = file.substring(0, 6);
        if (!groups[ym]) groups[ym] = [];
        groups[ym].push(file);
    });

    Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach((month, idx) => {
        const label = document.createElement('div');
        label.className = 'month-label';
        label.textContent = `${month.substring(0,4)}年 ${month.substring(4,6)}月`;
        menu.appendChild(label);

        groups[month].forEach(file => {
            const item = document.createElement('div');
            item.className = 'sub-item';
            item.textContent = formatSnapshotLabel(file);
            item.onclick = (e) => { e.stopPropagation(); selectDate(file, item); };
            menu.appendChild(item);
            if (idx === 0 && groups[month][0] === file) { selectDate(file, item, false); menu.classList.add('show'); }
        });
    });
}

// Wire up detail button clicks via event delegation (replaces window.toggleDetails)
document.getElementById('inventory-body').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-detail');
    if (btn) toggleDetails(Number(btn.dataset.idx), currentRows);
});
