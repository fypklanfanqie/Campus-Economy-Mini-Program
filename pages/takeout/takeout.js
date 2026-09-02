// pages/takeout/takeout.js - 校门口外卖代拿下单页
Page({
  data: {
    // 表单
    recipientName: '',
    phone: '',
    lockerCode: '',
    remark: '',

    gateOptions: ['北一门', '北二门', '西门', '南门'],
    gateLocation: '',

    deliveryType: '',
    gateFee: 1.5,
    dormFee: 2.0,

    deliveryZone: '',
    dormBuilding: '',
    zoneOptions: [
      '园区一', '园区二', '园区三', '园区四', '园区五', '园区六',
      '园区七', '园区八', '园区九', '园区十', '园区十一'
    ],
    showZoneModal: false,

    totalPrice: 0,
    totalPriceText: '0.00',
    canSubmit: false,

    submitting: false,
    paying: false
  },

  onLoad() {
    this.loadUserProfile();
  },

  loadUserProfile() {
    const localProfile = wx.getStorageSync('userProfile');
    if (localProfile && localProfile.recipientName) {
      this.setData({
        recipientName: localProfile.recipientName || '',
        phone: localProfile.phone || '',
        deliveryZone: localProfile.deliveryZone || ''
      });
    }
    wx.cloud.callFunction({ name: 'getUserProfile' }).then(res => {
      if (res.result && res.result.code === 0 && res.result.data && res.result.data.recipientName) {
        const p = res.result.data;
        this.setData({
          recipientName: p.recipientName || '',
          phone: p.phone || '',
          deliveryZone: p.deliveryZone || ''
        });
        wx.setStorageSync('userProfile', p);
      }
    }).catch(() => {});
  },

  saveUserProfile() {
    const profile = {
      recipientName: this.data.recipientName.trim(),
      phone: this.data.phone.trim(),
      deliveryZone: this.data.deliveryZone
    };
    wx.setStorageSync('userProfile', profile);
    wx.cloud.callFunction({ name: 'saveUserProfile', data: profile }).catch(() => {});
  },

  onNameInput(e) { this.setData({ recipientName: e.detail.value }); },
  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },
  onLockerInput(e) { this.setData({ lockerCode: e.detail.value }); },
  onDormInput(e) { this.setData({ dormBuilding: e.detail.value }); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  selectGate(e) { this.setData({ gateLocation: e.currentTarget.dataset.gate }); this.computePrice(); },
  selectDeliveryType(e) { this.setData({ deliveryType: e.currentTarget.dataset.type }); this.computePrice(); },
  showZonePicker() { this.setData({ showZoneModal: true }); },
  closeZonePicker() { this.setData({ showZoneModal: false }); },
  selectZone(e) { this.setData({ deliveryZone: e.currentTarget.dataset.zone, showZoneModal: false }); this.computePrice(); },

  computePrice() {
    let total = 0;
    if (this.data.deliveryType === 'gate') total = this.data.gateFee;
    else if (this.data.deliveryType === 'dorm') total = this.data.dormFee;

    const valid = !!this.data.gateLocation && !!this.data.deliveryType && !!this.data.deliveryZone;
    this.setData({ totalPrice: total, totalPriceText: total.toFixed(2), canSubmit: valid });
  },

  validateForm() {
    const { recipientName, phone, gateLocation, deliveryType, deliveryZone } = this.data;
    if (!recipientName.trim()) { wx.showToast({ title: '请输入收货人姓名', icon: 'none' }); return false; }
    if (!phone.trim() || !/^1[3-9]\d{9}$/.test(phone.trim())) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return false; }
    if (!gateLocation) { wx.showToast({ title: '请选择外卖所在校门', icon: 'none' }); return false; }
    if (!deliveryType) { wx.showToast({ title: '请选择送达方式', icon: 'none' }); return false; }
    if (!deliveryZone) { wx.showToast({ title: '请选择送达园区', icon: 'none' }); return false; }
    return true;
  },

  async submitOrder() {
    if (!this.validateForm()) return;
    if (this.data.paying) return;
    this.setData({ submitting: true });

    const finalPrice = this.data.totalPrice;

    try {
      const res = await wx.cloud.callFunction({
        name: 'createOrder',
        data: {
          orderType: 'takeout',
          recipientName: this.data.recipientName.trim(),
          phone: this.data.phone.trim(),
          gateLocation: this.data.gateLocation,
          lockerCode: this.data.lockerCode.trim(),
          deliveryType: this.data.deliveryType,
          deliveryZone: this.data.deliveryZone,
          dormBuilding: this.data.dormBuilding.trim(),
          price: finalPrice,
          remark: this.data.remark.trim()
        },
        timeout: 15000
      });

      if (res.result && res.result.code === 0) {
        const orderId = res.result.data.orderId;
        this.saveUserProfile();
        // 0 元订单：直接面单，无需拉起支付
        if (res.result.data.free) {
          wx.showToast({ title: '订单创建成功', icon: 'success' });
          // 兜底确认免费订单状态为待接单（幂等，已面单则直接返回）
          wx.cloud.callFunction({ name: 'confirmPayment', data: { orderId }, timeout: 15000 }).catch(() => {});
          this.afterPaid(orderId);
          return;
        }
        wx.showToast({ title: '订单创建成功', icon: 'success' });
        this.doPay(orderId);
      } else {
        wx.showToast({ title: res.result?.message || '创建订单失败', icon: 'none' });
      }
    } catch (err) {
      console.error('提交外卖订单失败:', err);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async doPay(orderId) {
    if (!orderId) { wx.showToast({ title: '订单信息异常', icon: 'none' }); return; }
    if (this.data.paying) return;
    this.setData({ paying: true });
    wx.showLoading({ title: '调起支付中' });

    try {
      const res = await wx.cloud.callFunction({ name: 'createWechatPayOrder', data: { orderId }, timeout: 30000 });
      if (!res.result || res.result.code !== 0) {
        wx.hideLoading();
        wx.showToast({ title: res.result?.message || '创建支付失败', icon: 'none' });
        this.setData({ paying: false });
        return;
      }
      const pay = res.result.data;
      wx.hideLoading();

      if (pay.free) {
        wx.showToast({ title: '下单成功', icon: 'success' });
        this.afterPaid(orderId);
        return;
      }

      wx.requestPayment({
        timeStamp: pay.timeStamp,
        nonceStr: pay.nonceStr,
        package: pay.package,
        signType: 'RSA',
        paySign: pay.paySign,
        success: async () => {
          const q = await wx.cloud.callFunction({ name: 'queryWechatPayOrder', data: { orderId }, timeout: 30000 });
          if (q.result && q.result.code === 0 && q.result.data && q.result.data.paid) {
            wx.showToast({ title: '支付成功，正在匹配骑手', icon: 'success' });
          } else {
            wx.showToast({ title: '支付确认中，请稍后刷新', icon: 'none' });
          }
          this.afterPaid(orderId);
        },
        fail: (err) => {
          if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) {
            wx.showToast({ title: '已取消支付', icon: 'none' });
          } else {
            wx.showToast({ title: '支付失败，可稍后在订单中支付', icon: 'none' });
          }
          wx.switchTab({ url: '/pages/order-list/order-list' });
        }
      });
    } catch (err) {
      wx.hideLoading();
      console.error('调起支付异常:', err);
      wx.showToast({ title: '调起支付失败', icon: 'none' });
    } finally {
      this.setData({ paying: false });
    }
  },

  afterPaid(orderId) {
    wx.redirectTo({ url: `/pages/order-detail/order-detail?id=${orderId}` });
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }); }
});
