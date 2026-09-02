// custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: 'house' },
      { pagePath: '/pages/order-list/order-list', text: '订单', icon: 'doc-plaintext' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: 'person' }
    ]
  },
  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const path = this.data.list[index].pagePath;

      // 已在当前 tab，不重复跳转
      if (this.data.selected === index) return;

      // 防止快速连点导致路由冲突
      if (this._switching) return;
      this._switching = true;

      wx.switchTab({
        url: path,
        fail: (err) => {
          console.error('switchTab 失败，尝试 reLaunch:', err);
          wx.reLaunch({ url: path });
        },
        complete: () => {
          this._switching = false;
        }
      });
    }
  }
});
