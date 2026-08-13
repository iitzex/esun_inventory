import { init, handleDownload, exportToSelfTxt, switchView, loadNewsInfo, handleDashboardClick, setSort } from './actions.js';

// Expose globals required by index.html inline onclick handlers
window.handleDashboardClick = handleDashboardClick;
window.switchView = switchView;
window.loadNewsInfo = loadNewsInfo;
window.handleDownload = handleDownload;
window.exportToSelfTxt = exportToSelfTxt;
window.setSort = setSort;

(async () => {
    await init();
    handleDownload();
})();
