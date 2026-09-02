// utils/theme.js - 主题检测与监听工具

function getSystemTheme() {
  return new Promise((resolve) => {
    wx.getSystemInfo({
      success(res) {
        resolve(res.theme || 'light');
      },
      fail() {
        resolve('light');
      }
    });
  });
}

function applyTheme(theme) {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  if (page) {
    page.setData({ theme });
  }
}

function initTheme() {
  getSystemTheme().then(theme => {
    applyTheme(theme);
  });

  if (wx.onThemeChange) {
    wx.onThemeChange((res) => {
      applyTheme(res.theme);
    });
  }
}

module.exports = {
  getSystemTheme,
  applyTheme,
  initTheme
};
