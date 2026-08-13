export const ToonParser = {
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
            if (isListItem) {
                // List items are always scalars in TOON ("- value"); the emitter
                // never writes inline "key: value" list items. Treat the whole
                // remainder as a single value so scalars containing ':' (e.g.
                // "- 09:30:00") are not mis-split into {key: value}.
                value = trimmedLine.substring(1).trim();
            } else {
                const colonIndex = trimmedLine.indexOf(':');
                if (colonIndex !== -1) {
                    key = trimmedLine.substring(0, colonIndex).trim();
                    value = trimmedLine.substring(colonIndex + 1).trim();
                } else {
                    value = trimmedLine;
                }
            }

            while (stack.length > 1 && indent <= stack[stack.length - 1].level) {
                stack.pop();
            }

            const parent = stack[stack.length - 1].obj;

            if (isListItem) {
                let newObj = {};
                if (value !== "") {
                    newObj = this._parseVal(value);
                }
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
        // Keep integer strings with a leading zero (e.g. stock codes "0050",
        // "006208") so the leading zero is preserved; decimals like "0.50"
        // must still become numbers.
        if (/^0\d+$/.test(v) || /^\d{4}$/.test(v)) return v;
        const num = Number(v);
        return Number.isNaN(num) || v.trim() === '' ? v : num;
    }
};

export const currencyFormatter = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
export const percentFormatter = new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always'
});

export function formatNum(num) {
    return currencyFormatter.format(num || 0);
}

export function formatSignedNum(num) {
    const value = Number(num) || 0;
    return `${value >= 0 ? '+' : '-'}${formatNum(Math.abs(value))}`;
}

export function formatSignedPercent(num) {
    return `${percentFormatter.format(Number(num) || 0)}%`;
}

export function formatSnapshotLabel(filename) {
    const raw = String(filename || '').replace('.toon', '');
    if (raw.length !== 8) return raw || '未知日期';
    return `${raw.slice(0, 4)}/${raw.slice(4, 6)}/${raw.slice(6, 8)}`;
}
