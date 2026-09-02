// pages/profile/profile.js - 个人中心逻辑
const app = getApp();

Page({
  data: {
    userInfo: {
      avatarUrl: '',
      nickName: ''
    },
    userOpenid: '',

    // 骑手状态
    isRider: false,
    riderBalance: '0.00',

    // 订单统计
    orderStats: null,

    // 管理员入口
    adminEntryTimer: null,
    showAdminTip: false,
    showAdminModal: false,
    adminPassword: '',
    isAdmin: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // 从本地恢复用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
    }

    // 恢复管理员状态
    const isAdmin = wx.getStorageSync('isAdmin');
    this.setData({ isAdmin: !!isAdmin });

    // 获取openid（首次）
    if (!app.globalData.openid) {
      this.getOpenid();
    } else {
      this.setData({ userOpenid: app.globalData.openid });
    }

    // 加载订单统计
    this.loadOrderStats();
    // 加载骑手状态
    this.loadRiderInfo();
  },

  /**
   * 微信一键登录：拉起微信头像昵称授权，直接登录微信号
   * 头像通过 chooseAvatar 按钮获取，昵称通过 type=nickname 输入框回填，无需手动输入
   */
  async onWechatLogin() {
    // 若已有 openid 则视为已登录微信号；否则触发一次云调用确保拿到 openid
    if (!app.globalData.openid) {
      await this.getOpenid();
    }
    // 若用户还没选头像/昵称，引导点击头像与昵称框（微信限制需用户主动触发）
    if (!this.data.userInfo.avatarUrl || !this.data.userInfo.nickName) {
      wx.showToast({ title: '请点击头像和昵称完成授权', icon: 'none' });
      return;
    }
    // 已选择，直接保存并登录
    this.persistUserInfo();
    wx.showToast({ title: '登录成功', icon: 'success' });
  },

  /**
   * 点击昵称输入框：聚焦后微信会自动弹出昵称选择，无需手动输入
   */
  onNicknameTap() {
    // 仅触发聚焦，昵称由微信自动回填到 bindinput
  },

  /**
   * 昵称失焦时自动保存
   */
  onNicknameBlur() {
    this.persistUserInfo();
  },

  /**
   * 持久化用户头像昵称到本地、全局和云端 userProfiles
   */
  async persistUserInfo() {
    const userInfo = this.data.userInfo;
    if (!userInfo.avatarUrl && !userInfo.nickName) return;
    wx.setStorageSync('userInfo', userInfo);
    app.globalData.userInfo = userInfo;

    // 同步到云端 userProfiles（若已有收货信息则一并更新昵称头像）
    try {
      await wx.cloud.callFunction({
        name: 'saveUserProfile',
        data: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          // 兜底字段，确保后端不报"姓名手机号不能为空"
          recipientName: userInfo.recipientName || userInfo.nickName || '微信用户',
          phone: userInfo.phone || '00000000000'
        }
      });
    } catch (e) {
      console.error('同步用户资料失败:', e);
    }
  },

  /**
   * 获取用户openid
   */
  async getOpenid() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getOrders',
        data: {
          status: 'all',
          page: 1,
          pageSize: 1
        }
      });
      // 云函数会自动从 context 获取 openid，这里只需触发一次调用
      if (res.result && res.result.code === 0 && res.result.data._openid) {
        app.globalData.openid = res.result.data._openid;
        this.setData({ userOpenid: res.result.data._openid });
      }
    } catch (err) {
      console.error('获取openid失败:', err);
    }
  },

  /**
   * 加载订单统计数据
   */
  async loadOrderStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getOrders',
        data: {
          status: 'all',
          page: 1,
          pageSize: 1,
          withStats: true // 请求统计信息
        },
        config: { timeout: 30000 }
      });

      if (res.result && res.result.code === 0 && res.result.data.stats) {
        this.setData({ orderStats: res.result.data.stats });
      }
    } catch (err) {
      console.error('加载订单统计失败:', err);
    }
  },

  /**
   * 加载骑手状态（轻量查询，仅返回骑手资料）
   */
  async loadRiderInfo() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getRiderHome',
        data: { light: true }
      });
      if (res.result && res.result.code === 0) {
        const rider = res.result.data.rider;
        this.setData({
          isRider: !!rider,
          riderBalance: rider ? rider.balance.toFixed(2) : '0.00'
        });
      }
    } catch (err) {
      console.error('加载骑手状态失败:', err);
    }
  },

  /**
   * 跳转骑手中心
   */
  goRider() {
    wx.navigateTo({ url: '/pages/rider/rider' });
  },

  /**
   * 选择头像（微信 chooseAvatar 回调）
   */
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    const userInfo = { ...this.data.userInfo, avatarUrl };
    this.setData({ userInfo });
    this.persistUserInfo();
  },

  /**
   * 昵称输入（微信 type=nickname 自动回填）
   */
  onNicknameInput(e) {
    const nickName = e.detail.value;
    const userInfo = { ...this.data.userInfo, nickName };
    this.setData({ userInfo });
    // 微信昵称回填后立即同步，无需手动点保存
    this.persistUserInfo();
  },

  /**
   * 保存用户信息到本地和全局（保留旧接口兼容）
   */
  saveUserInfo() {
    this.persistUserInfo();
  },

  /**
   * 长按头像提示管理员入口
   */
  showAdminEntry() {
    this.setData({ showAdminTip: true });

    // 清除之前的定时器
    if (this.data.adminEntryTimer) {
      clearTimeout(this.data.adminEntryTimer);
    }

    // 如果已登录则直接进入
    if (this.data.isAdmin) {
      wx.navigateTo({ url: '/pages/admin/dashboard' });
      return;
    }

    // 3秒后显示密码弹窗
    const timer = setTimeout(() => {
      this.setData({
        showAdminTip: false,
        showAdminModal: true
      });
    }, 3000);

    this.setData({ adminEntryTimer: timer });
  },

  /**
   * 关闭管理密码弹窗
   */
  closeAdminModal() {
    this.setData({
      showAdminModal: false,
      adminPassword: ''
    });
    if (this.data.adminEntryTimer) {
      clearTimeout(this.data.adminEntryTimer);
    }
  },

  /**
   * 密码输入
   */
  onPasswordInput(e) {
    this.setData({ adminPassword: e.detail.value });
  },

  /**
   * 验证管理员密码
   */
  async verifyAdmin() {
    const password = this.data.adminPassword.trim();
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'verifyAdmin',
        data: { password },
        config: { timeout: 30000 }
      });

      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '验证成功', icon: 'success' });

        // 保存管理员登录态
        wx.setStorageSync('isAdmin', true);
        app.globalData.isAdmin = true;
        this.setData({
          isAdmin: true,
          showAdminModal: false,
          adminPassword: ''
        });

        // 跳转管理后台
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/admin/dashboard' });
        }, 500);
      } else {
        wx.showToast({
          title: res.result?.message || '密码错误',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('验证失败:', err);
      wx.showToast({ title: '验证失败', icon: 'none' });
    }
  },

  /**
   * 跳转订单列表
   */
  goOrders(e) {
    const status = e.currentTarget.dataset.status || 'all';
    wx.switchTab({ url: '/pages/order-list/order-list' });
    // 通过全局变量传递筛选状态
    app.globalData.orderFilterStatus = status;
  },

  /**
   * 跳转管理员后台
   */
  goAdmin() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '请先验证管理员身份', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/admin/dashboard' });
  },

  /**
   * 退出管理员登录
   */
  logoutAdmin() {
    wx.showModal({
      title: '提示',
      content: '确定退出管理员模式吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('isAdmin');
          app.globalData.isAdmin = false;
          this.setData({ isAdmin: false });
          wx.showToast({ title: '已退出', icon: 'success' });
        }
      }
    });
  },

  /**
   * 拨打客服电话
   */
  callPhone() {
    // TODO: 替换为你的客服电话，或在后台配置
    wx.makePhoneCall({
      phoneNumber: '10086'
    });
  },

  /**
   * 复制客服QQ号到剪贴板
   */
  copyQQ() {
    wx.setClipboardData({
      data: 'YOUR_QQ_NUMBER',
      success: () => {
        wx.showToast({ title: 'QQ号已复制', icon: 'success' });
      }
    });
  },

  /**
   * 阻止事件冒泡
   */
  noop() {}
});
