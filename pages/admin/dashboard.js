// pages/admin/dashboard.js - 管理员后台（事后抽查）
const app = getApp();

Page({
  data: {
    orders: [],
    totalCount: 0,
    totalAmount: 0,
    loading: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 1,
    activeTab: 'all',  // 当前筛选状态

    // 状态文本映射
    statusTextMap: {
      pending_payment: '待付款',
      pending_pickup: '待接单',
      accepted: '已接单',
      delivering: '配送中',
      completed: '已完成',
      cancelled: '已取消'
    },

    // 标记未付款弹窗
    showUnpaidModal: false,
    markingOrderId: '',
    blacklistUser: true,

    // 提现审核弹窗
    showWithdrawModal: false,
    withdrawList: []
  },

  onShow() {
    // 校验管理员权限
    const isAdmin = wx.getStorageSync('isAdmin');
    if (!isAdmin) {
      wx.showModal({
        title: '无权限',
        content: '请先在个人中心验证管理员身份',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/profile/profile' });
        }
      });
      return;
    }

    // 加载订单列表
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
        name: 'adminGetOrders',
        data: {
          page: this.data.currentPage,
          pageSize: this.data.pageSize,
          status: this.data.activeTab === 'all' ? undefined : this.data.activeTab
        }
      });

      if (res.result && res.result.code === 0) {
        const newOrders = (res.result.data.list || []).map(order => ({
          ...order,
          payTimeText: this.formatTime(order.payTime),
          createTimeText: this.formatTime(order.createTime)
        }));

        this.setData({
          orders: [...this.data.orders, ...newOrders],
          totalCount: res.result.data.total || 0,
          totalAmount: res.result.data.totalAmount || 0,
          hasMore: newOrders.length >= this.data.pageSize,
          currentPage: this.data.currentPage + 1
        });
      } else if (res.result && res.result.code === 403) {
        // 无权限
        wx.showModal({
          title: '权限不足',
          content: '您不是管理员，无法访问此页面',
          showCancel: false,
          success: () => wx.switchTab({ url: '/pages/profile/profile' })
        });
      } else {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    } catch (err) {
      console.error('加载订单失败:', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
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
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${m}-${day} ${h}:${min}`;
  },

  /**
   * 点击"标记未付款"- 弹出确认框
   */
  markUnpaid(e) {
    const { id, price, user } = e.currentTarget.dataset;
    this.setData({
      showUnpaidModal: true,
      markingOrderId: id,
      blacklistUser: true
    });
  },

  /**
   * 返回上一页
   */
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/profile/profile' });
    }
  },

  /**
   * 关闭确认弹窗
   */
  closeUnpaidModal() {
    this.setData({
      showUnpaidModal: false,
      markingOrderId: ''
    });
  },

  /**
   * 切换拉黑选项
   */
  toggleBlacklist() {
    this.setData({ blacklistUser: !this.data.blacklistUser });
  },

  /**
   * 打开提现审核弹窗
   */
  async openWithdrawReview() {
    this.setData({ showWithdrawModal: true, withdrawList: [] });
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminWithdrawals',
        data: { action: 'list', status: 'all' }
      });
      if (res.result && res.result.code === 0) {
        const list = (res.result.data.list || []).map(w => ({
          ...w,
          amountText: '¥' + (w.amount || 0).toFixed(2),
          createTimeText: this.formatTime(w.createTime),
          statusText: w.status === 'pending' ? '待审核' : w.status === 'completed' ? '已通过' : '已驳回',
          canHandle: w.status === 'pending'
        }));
        this.setData({ withdrawList: list });
      } else if (res.result && res.result.code === 403) {
        this.setData({ showWithdrawModal: false });
        wx.showToast({ title: '无权限', icon: 'none' });
      } else {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    }
  },

  /**
   * 关闭提现审核弹窗
   */
  closeWithdrawReview() {
    this.setData({ showWithdrawModal: false });
  },

  /**
   * 通过 / 驳回提现
   */
  handleWithdraw(e) {
    const { id, action } = e.currentTarget.dataset;
    const tip = action === 'approve'
      ? '确认通过该提现申请？'
      : '确认驳回该申请（金额退回骑手）？';
    wx.showModal({
      title: '提现审核',
      content: tip,
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中' });
        try {
          const res = await wx.cloud.callFunction({
            name: 'adminWithdrawals',
            data: { action, withdrawalId: id }
          });
          if (res.result && res.result.code === 0) {
            wx.showToast({ title: res.result.message || '操作成功', icon: 'success' });
            this.openWithdrawReview();
          } else {
            wx.showToast({ title: res.result?.message || '操作失败', icon: 'none' });
          }
        } catch (err) {
          wx.showToast({ title: '网络异常', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  /**
   * 确认标记未付款
   */
  async confirmMarkUnpaid() {
    if (!this.data.markingOrderId) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'adminMarkUnpaid',
        data: {
          orderId: this.data.markingOrderId,
          blacklist: this.data.blacklistUser
        }
      });

      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '已标记为未付款', icon: 'success' });
        // 移除该订单，刷新列表
        const updatedOrders = this.data.orders.filter(
          o => o._id !== this.data.markingOrderId
        );
        this.setData({
          orders: updatedOrders,
          showUnpaidModal: false,
          markingOrderId: '',
          totalCount: this.data.totalCount - 1
        });
      } else {
        wx.showToast({
          title: res.result?.message || '操作失败',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('标记未付款失败:', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    }
  }
});
