import { init, handleDownload, exportToSelfTxt, switchView, loadNewsInfo, handleDashboardClick, setSort, toggleTheme } from './actions.js';

// Expose globals required by index.html inline onclick handlers
window.handleDashboardClick = handleDashboardClick;
window.switchView = switchView;
window.loadNewsInfo = loadNewsInfo;
window.handleDownload = handleDownload;
window.exportToSelfTxt = exportToSelfTxt;
window.setSort = setSort;
window.toggleTheme = toggleTheme;

(async () => {
    await init();
    handleDownload();
})();
