import { ToonParser, formatSnapshotLabel } from './parser.js';

export const snapshotSummaryCache = new Map();

export function rowToPosition(row) {
    const stkNo = row?.stk_no || 'N/A';
    return {
        stkNo,
        stkNa: row?.stk_na || '未知股票',
        qty: parseFloat(row?.qty_l) || 0,
        avgPrice: parseFloat(row?.price_avg) || 0,
        nowPrice: parseFloat(row?.price_now) || 0,
        mktValue: parseFloat(row?.rec_va_sum) || 0,
        plSum: parseFloat(row?.make_a_sum) || 0,
        per: parseFloat(row?.make_a_per) || 0,
        costRaw: Math.abs(parseFloat(row?.cost_sum || 0)),
        details: Array.isArray(row?.stk_dats) ? row.stk_dats : [],
    };
}

export function summarizeInventoryRows(inventoryList) {
    const rows = Array.isArray(inventoryList) ? inventoryList : [];
    let totalMkt = 0, totalCost = 0, totalPL = 0;
    const positions = new Map();

    rows.forEach((row) => {
        const pos = rowToPosition(row);
        if (pos.stkNo === 'N/A') return;

        totalMkt += pos.mktValue;
        totalCost += pos.costRaw;
        totalPL += pos.plSum;
        positions.set(pos.stkNo, pos);
    });

    return {
        totalMkt, totalCost, totalPL,
        roi: totalCost > 0 ? (totalPL / totalCost) * 100 : 0,
        positionCount: positions.size,
        positions,
    };
}

export function summarizeSnapshotData(dataObj) {
    const summary = summarizeInventoryRows(dataObj?.inventory);
    const balance = dataObj?.balance || {};
    const availableBalance = parseFloat(balance.available_balance) || 0;
    const exchangeBalance = parseFloat(balance.exchange_balance ?? balance.exange_balance) || 0;
    const reservedBalance = parseFloat(balance.stock_pre_save_amount) || 0;

    return {
        ...summary,
        availableBalance,
        exchangeBalance,
        reservedBalance,
        netLiquidity: availableBalance + exchangeBalance - reservedBalance,
    };
}

export function createSnapshotSummary(filename, dataObj) {
    return {
        filename,
        label: formatSnapshotLabel(filename),
        ...summarizeSnapshotData(dataObj),
    };
}

export async function loadSnapshotSummary(filename) {
    if (!filename) return null;
    if (snapshotSummaryCache.has(filename)) return snapshotSummaryCache.get(filename);

    const toonText = await window.electronAPI.readInventory(filename);
    if (!toonText) return null;

    const summary = createSnapshotSummary(filename, ToonParser.parse(toonText));
    snapshotSummaryCache.set(filename, summary);
    return summary;
}

export function diffSummaries(current, previous) {
    if (!current || !previous) return null;

    const added = [], removed = [], changed = [], qtyChanged = [];

    current.positions.forEach((curr, stkNo) => {
        const prev = previous.positions.get(stkNo);
        if (!prev) { added.push(curr); return; }

        const qtyDelta = curr.qty - prev.qty;
        const plDelta = curr.plSum - prev.plSum;
        const mktDelta = curr.mktValue - prev.mktValue;
        if (qtyDelta !== 0 || plDelta !== 0 || mktDelta !== 0) {
            const item = { stkNo, stkNa: curr.stkNa, qtyDelta, plDelta, mktDelta, currQty: curr.qty, prevQty: prev.qty };
            changed.push(item);
            if (qtyDelta !== 0) qtyChanged.push(item);
        }
    });

    previous.positions.forEach((prev, stkNo) => {
        if (!current.positions.has(stkNo)) removed.push(prev);
    });

    changed.sort((a, b) => Math.abs(b.plDelta) - Math.abs(a.plDelta));

    return {
        added, removed, changed, qtyChanged,
        totalMktDelta: current.totalMkt - previous.totalMkt,
        totalPLDelta: current.totalPL - previous.totalPL,
        totalRoiDelta: current.roi - previous.roi,
        totalPositionDelta: current.positionCount - previous.positionCount,
    };
}
