// pages/rider/rider.js - 骑手中心
const WITHDRAW_THRESHOLD = 20;

// 骑手收入规则（元）
const RIDER_INCOME = {
  onCampus: { small: 2.4, medium: 3.2, large: 4.1 },
  offCampus: { small: 4.4, medium: 5.2, large: 6.1 }
};

Page({
  data: {
    isRider: false,
    rider: null, // { riderName, balance, totalEarned, totalWithdrawn, pendingWithdrawal, ...Text }
    activeTab: 'available', // available | mine

    availableOrders: [],
    myOrders: [],
    withdrawals: [],

    // 注册
    regName: '',
    regPhone: '',
    regNickName: '',
    regAvatar: '',
    registering: false,

    // 提现
    showWithdrawModal: false,
    withdrawAmount: '',
    withdrawing: false,

    sizeTextMap: { small: '小件', medium: '中件', large: '大件' },
    statusTextMap: {
      accepted: '已接单',
      delivering: '配送中',
      completed: '已完成',
      cancelled: '已取消'
    },
    threshold: WITHDRAW_THRESHOLD,
    loading: false
  },

  onShow() {
    // 先恢复本地已注册状态，避免 refresh 失败导致界面回退到注册表单
    const cached = wx.getStorageSync('isRider');
    if (cached) {
      const cachedRider = wx.getStorageSync('riderInfo');
      this.setData({ isRider: true, rider: cachedRider || this.data.rider });
    }
    this.refresh();
  },

  /**
   * 加载骑手首页数据
   */
  async refresh() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getRiderHome' });
      if (res.result && res.result.code === 0) {
        const d = res.result.data;
        const rider = d.rider;

        const avail = (d.availableOrders || []).map(o => ({
          ...o,
          sizeText: this.orderTitle(o),
          locText: this.orderLoc(o),
          incomeText: this.calcIncome(o),
          createTimeText: this.fmt(o.createTime)
        }));

        const mine = (d.myOrders || []).map(o => ({
          ...o,
          incomeText: o.income ? '¥' + o.income.toFixed(2) : '',
          sizeText: this.orderTitle(o),
          locText: this.orderLoc(o),
          statusText: this.data.statusTextMap[o.status] || o.status,
          createTimeText: this.fmt(o.createTime)
        }));

        const wds = (d.withdrawals || []).map(w => ({
          ...w,
          amountText: '¥' + (w.amount || 0).toFixed(2),
          createTimeText: this.fmt(w.createTime),
          statusText: w.status === 'pending' ? '审核中' : w.status === 'completed' ? '已到账' : '已驳回'
        }));

        const riderView = rider ? {
          ...rider,
          balanceText: (rider.balance || 0).toFixed(2),
          totalEarnedText: (rider.totalEarned || 0).toFixed(2),
          totalWithdrawnText: (rider.totalWithdrawn || 0).toFixed(2),
          pendingWithdrawalText: (rider.pendingWithdrawal || 0).toFixed(2)
        } : null;

        // 若本地已确认注册（缓存 isRider），但本次查询 rider 为空（瞬时失败/延迟），
        // 则保留本地状态，不回退到注册界面，避免刚注册完又被判定为未注册。
        const cachedIsRider = wx.getStorageSync('isRider');
        if (!rider && cachedIsRider) {
          this.setData({
            availableOrders: avail,
            myOrders: mine,
            withdrawals: wds
          });
          return;
        }

        this.setData({
          isRider: !!rider,
          rider: riderView,
          availableOrders: avail,
          myOrders: mine,
          withdrawals: wds
        });
      } else {
        wx.showToast({ title: res.result?.message || '加载失败', icon: 'none' });
      }
    } catch (err) {
      console.error('加载骑手首页失败:', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 预估收入文案
   */
  calcIncome(o) {
    // 优先使用订单实际的骑手收入（income 字段，createOrder 已正确计算）
    if (o.income != null && o.income !== undefined) return '¥' + o.income.toFixed(2);
    if (o.orderType === 'print') return '¥' + (o.deliveryFee || 2.0).toFixed(2); // 兜底：配送费归骑手
    if (o.orderType === 'takeout') return '¥' + (o.deliveryFee || o.price || 0).toFixed(2); // 兜底：配送费全额归骑手
    const m = RIDER_INCOME[o.locationType] || {};
    const v = m[o.packageSize];
    return v != null ? '¥' + v.toFixed(2) : '';
  },

  /**
   * 订单标题：打印显示文件名，外卖显示校门，快递显示包裹大小
   */
  orderTitle(o) {
    if (o.orderType === 'print') return o.fileName || '文件打印';
    if (o.orderType === 'takeout') return '外卖代拿';
    if (o.orderType === 'selfpick') return '校内代取餐';
    return this.data.sizeTextMap[o.packageSize] || o.packageSize;
  },

  /**
   * 位置/类型副标题
   */
  orderLoc(o) {
    if (o.orderType === 'print') return '文件打印';
    if (o.orderType === 'takeout') return o.deliveryType === 'dorm' ? '送宿舍门口' : '送园区门口';
    if (o.orderType === 'selfpick') return o.merchantLocation || '校内商家';
    return o.locationType === 'offCampus' ? '校外' : '校内';
  },

  fmt(date) {
    if (!date) return '';
    const d = new Date(date);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  },

  // ========== 注册 ==========
  // 微信头像选择
  onChooseAvatar(e) {
    this.setData({ regAvatar: e.detail.avatarUrl });
  },
  // 微信昵称一键回填：自动填充到真实姓名（用户可改）
  onRegNickInput(e) {
    const nick = e.detail.value;
    this.setData({ regNickName: nick });
    // 若姓名未单独填写，则用微信昵称作为默认姓名
    if (!this.data.regName) {
      this.setData({ regName: nick });
    }
  },
  onRegNickBlur() {
    // 昵称失焦无需额外处理
  },
  onRegName(e) { this.setData({ regName: e.detail.value }); },
  onRegPhone(e) { this.setData({ regPhone: e.detail.value }); },

  async registerRider() {
    const name = this.data.regName.trim();
    const phone = this.data.regPhone.trim();
    if (!name) {
      wx.showToast({ title: '请填写真实姓名', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    this.setData({ registering: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'registerRider',
        data: {
          riderName: name,
          riderPhone: phone,
          nickName: this.data.regNickName || '',
          avatarUrl: this.data.regAvatar || ''
        }
      });
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '开通成功', icon: 'success' });
        // 持久化已注册状态，防止重新进入时回退到注册表单
        const riderObj = {
          riderName: name,
          riderPhone: phone,
          nickName: this.data.regNickName || '',
          avatarUrl: this.data.regAvatar || '',
          balance: 0, balanceText: '0.00',
          totalEarned: 0, totalEarnedText: '0.00',
          totalWithdrawn: 0, totalWithdrawnText: '0.00',
          pendingWithdrawal: 0, pendingWithdrawalText: '0.00'
        };
        wx.setStorageSync('isRider', true);
        wx.setStorageSync('riderInfo', riderObj);
        // 乐观更新：立即切到骑手界面，再刷新数据
        this.setData({ isRider: true, rider: riderObj });
        this.refresh();
      } else {
        wx.showToast({ title: res.result?.message || '开通失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ registering: false });
    }
  },

  // ========== 分段切换 ==========
  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  // ========== 接单 ==========
  acceptOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '接单确认',
      content: '接单后将由您负责配送，确认接单？',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '接单中' });
        try {
          const res = await wx.cloud.callFunction({
            name: 'acceptOrder',
            data: { orderId: id }
          });
          if (res.result && res.result.code === 0) {
            wx.showToast({ title: '接单成功', icon: 'success' });
            this.refresh();
          } else {
            wx.showToast({ title: res.result?.message || '接单失败', icon: 'none' });
          }
        } catch (err) {
          wx.showToast({ title: '网络异常', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  // ========== 更新配送状态 ==========
  updateStatus(e) {
    const { id, action } = e.currentTarget.dataset;
    const tip = action === 'deliver' ? '确认出发配送？' : '确认已送达并完成订单？';
    wx.showModal({
      title: '提示',
      content: tip,
      success: async (r) => {
        if (!r.confirm) return;
        // 送达必须上传送达照片
        if (action === 'complete') {
          let photoFileID;
          try {
            photoFileID = await this.chooseAndUploadDeliveryPhoto();
          } catch (err) {
            // 用户取消选图 / 上传失败：直接返回，不完成订单
            wx.showToast({ title: err.message || '请先上传送达照片', icon: 'none' });
            return;
          }
          await this.doComplete(id, photoFileID);
          return;
        }
        await this.doUpdateStatus(id, action);
      }
    });
  },

  /**
   * 选图并上传到云存储，返回 fileID
   */
  chooseAndUploadDeliveryPhoto() {
    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
        success: async (res) => {
          const tempPath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
          if (!tempPath) {
            reject(new Error('未获取到图片'));
            return;
          }
          wx.showLoading({ title: '上传照片中' });
          try {
            const ext = (tempPath.split('.').pop() || 'jpg').toLowerCase();
            const cloudPath = `delivery_photos/${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
            const up = await wx.cloud.uploadFile({
              cloudPath,
              filePath: tempPath
            });
            if (!up || !up.fileID) {
              reject(new Error('照片上传失败'));
              return;
            }
            resolve(up.fileID);
          } catch (e) {
            reject(new Error('照片上传失败'));
          } finally {
            wx.hideLoading();
          }
        },
        fail: () => {
          reject(new Error('请先上传送达照片'));
        }
      });
    });
  },

  /**
   * 完成送达（带照片）
   */
  async doComplete(id, photoFileID) {
    wx.showLoading({ title: '处理中' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'riderUpdateStatus',
        data: { orderId: id, action: 'complete', deliveryPhoto: photoFileID }
      });
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '已完成，收入已结算', icon: 'success' });
        this.refresh();
      } else {
        wx.showToast({ title: res.result?.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 通用状态更新（出发配送）
   */
  async doUpdateStatus(id, action) {
    wx.showLoading({ title: '处理中' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'riderUpdateStatus',
        data: { orderId: id, action }
      });
      if (res.result && res.result.code === 0) {
        wx.showToast({
          title: action === 'deliver' ? '已出发配送' : '已完成，收入已结算',
          icon: 'success'
        });
        this.refresh();
      } else {
        wx.showToast({ title: res.result?.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // ========== 查看打印文件 ==========
  viewPrintFile(e) {
    const { url, type } = e.currentTarget.dataset;
    if (!url) {
      wx.showToast({ title: '文件地址获取失败', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '打开中' });
    wx.downloadFile({
      url,
      success: (dl) => {
        wx.hideLoading();
        if (dl.statusCode === 200) {
          wx.openDocument({
            filePath: dl.tempFilePath,
            fileType: type || 'pdf',
            showMenu: true,
            fail: () => wx.showToast({ title: '该文件无法预览', icon: 'none' })
          });
        } else {
          wx.showToast({ title: '文件下载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '文件下载失败', icon: 'none' });
      }
    });
  },

  // ========== 提现 ==========
  openWithdraw() {
    if (!this.data.rider || this.data.rider.balance < WITHDRAW_THRESHOLD) {
      wx.showToast({ title: `满¥${WITHDRAW_THRESHOLD}可提现`, icon: 'none' });
      return;
    }
    this.setData({ showWithdrawModal: true, withdrawAmount: '' });
  },
  closeWithdraw() { this.setData({ showWithdrawModal: false }); },
  onWithdrawAmount(e) { this.setData({ withdrawAmount: e.detail.value }); },

  async submitWithdraw() {
    const amt = parseFloat(this.data.withdrawAmount);
    const bal = this.data.rider ? this.data.rider.balance : 0;
    if (!(amt > 0)) {
      wx.showToast({ title: '请输入提现金额', icon: 'none' });
      return;
    }
    if (amt > bal + 0.001) {
      wx.showToast({ title: '超过可提现余额', icon: 'none' });
      return;
    }
    if (bal < WITHDRAW_THRESHOLD) {
      wx.showToast({ title: `满¥${WITHDRAW_THRESHOLD}可提现`, icon: 'none' });
      return;
    }
    wx.showModal({
      title: '申请提现',
      content: `确认提现 ¥${amt.toFixed(2)}？`,
      success: async (r) => {
        if (!r.confirm) return;
        this.setData({ withdrawing: true });
        try {
          const res = await wx.cloud.callFunction({
            name: 'requestWithdrawal',
            data: { amount: amt }
          });
          if (res.result && res.result.code === 0) {
            wx.showToast({ title: '申请已提交', icon: 'success' });
            this.setData({ showWithdrawModal: false });
            this.refresh();
          } else {
            wx.showToast({ title: res.result?.message || '提交失败', icon: 'none' });
          }
        } catch (err) {
          wx.showToast({ title: '网络异常', icon: 'none' });
        } finally {
          this.setData({ withdrawing: false });
        }
      }
    });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  noop() {}
});
