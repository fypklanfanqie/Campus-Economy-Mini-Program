// pages/index/index.js - 首页逻辑（极简 - 仅服务入口）
const app = getApp();

Page({
  data: {},

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  goOrder() {
    wx.navigateTo({ url: '/pages/order/order' });
  },

  goPrint() {
    wx.navigateTo({ url: '/pages/print/print' });
  },

  goTakeout() {
    wx.navigateTo({ url: '/pages/takeout/takeout' });
  },

  goSelfpick() {
    wx.navigateTo({ url: '/pages/selfpick/selfpick' });
  },

  onShareAppMessage() {
    return {
      title: 'NTU快递帮 - 足不出宿，快递到手',
      path: '/pages/index/index'
    };
  }
});