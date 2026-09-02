// pages/order-list/order-list.js - 订单列表页逻辑
Page({
  data: {
    // 当前激活的筛选标签
    activeTab: 'all',
    // 订单列表
    orders: [],
    // 分页
    pageSize: 20,
    currentPage: 1,
    hasMore: true,
    loading: false,

    // 状态文本映射
    statusTextMap: {
      pending_payment: '待付款',
      pending_pickup: '待接单',
      accepted: '已接单',
      delivering: '配送中',
      completed: '已完成',
      cancelled: '已取消'
    },

    // 包裹大小文本映射
    sizeTextMap: {
      small: '小件',
      medium: '中件',
      large: '大件'
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    // 每次显示页面时刷新列表
    this.setData({ orders: [], currentPage: 1, hasMore: true });
    this.loadOrders();
  },

  /**
   * 切换筛选标签
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;

    this.setData({
      activeTab: tab,
      orders: [],
      currentPage: 1,
      hasMore: true
    });
    this.loadOrders();
  },

  /**
   * 加载订单列表
   */
  async loadOrders() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'getOrders',
        data: {
          status: this.data.activeTab === 'all' ? undefined : this.data.activeTab,
          page: this.data.currentPage,
          pageSize: this.data.pageSize
        }
      });

      if (res.result && res.result.code === 0) {
        const newOrders = (res.result.data.list || []).map(order => ({
          ...order,
          createTimeText: this.formatTime(order.createTime)
        }));

        this.setData({
          orders: [...this.data.orders, ...newOrders],
          hasMore: newOrders.length >= this.data.pageSize,
          currentPage: this.data.currentPage + 1
        });
      }
    } catch (err) {
      console.error('加载订单列表失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 加载更多
   */
  loadMore() {
    this.loadOrders();
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hour = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hour}:${min}`;
  },

  /**
   * 跳转订单详情
   */
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${id}`
    });
  },

  /**
   * 去付款 - 跳转订单详情并弹出支付弹窗
   */
  goPay(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${id}&showPay=true`
    });
  },

  /**
   * 跳转首页
   */
  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  /**
   * 防止事件冒泡
   */
  noop() {},

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.setData({ orders: [], currentPage: 1, hasMore: true });
    this.loadOrders().then(() => {
      wx.stopPullDownRefresh();
    });
  }
});
