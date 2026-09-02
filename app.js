// app.js - NTU快递帮小程序入口文件
const theme = require('./utils/theme');

App({
  onLaunch: function () {
    // ========== 初始化云开发环境 ==========
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'YOUR_CLOUD_ENV_ID',
        traceUser: true
      });
    }

    // 尝试从本地存储恢复用户信息和管理员登录态
    this.globalData.userInfo = wx.getStorageSync('userInfo') || null;
    this.globalData.isAdmin = wx.getStorageSync('isAdmin') || false;

    // 初始化主题监听
    theme.initTheme();
  },

  globalData: {
    userInfo: null,   // 用户头像昵称信息
    isAdmin: false,   // 管理员登录态
    openid: ''        // 用户openid（首次获取后缓存）
  }
});
