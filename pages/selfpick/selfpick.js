// pages/selfpick/selfpick.js - 校内商家代取餐下单页
// 用户自填取餐码 + 取餐商家地点（仅限校内商家），选择送达园区，统一价 ¥3/单
Page({
  data: {
    // 表单
    recipientName: '',
    phone: '',
    pickupCode: '',        // 取餐码
    merchantLocation: '',  // 取餐商家地点（校内商家）
    remark: '',

    deliveryZone: '',
    zoneOptions: [
      '园区一', '园区二', '园区三', '园区四', '园区五', '园区六',
      '园区七', '园区八', '园区九', '园区十', '园区十一'
    ],
    showZoneModal: false,

    price: 3.0,            // 统一价
    priceText: '3.00',
    confirmedReady: false, // 已出餐确认

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
    this.validateSubmit();
  },
  onPickupInput(e) { this.setData({ pickupCode: e.detail.value }); this.validateSubmit(); },
  onMerchantInput(e) { this.setData({ merchantLocation: e.detail.value }); this.validateSubmit(); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  showZonePicker() { this.setData({ showZoneModal: true }); },
  closeZonePicker() { this.setData({ showZoneModal: false }); },
  selectZone(e) {
    this.setData({ deliveryZone: e.currentTarget.dataset.zone, showZoneModal: false });
    this.validateSubmit();
  },

  // 已出餐确认勾选
  toggleConfirm() {
    this.setData({ confirmedReady: !this.data.confirmedReady });
    this.validateSubmit();
  },

  validateSubmit() {
    const { recipientName, phone, pickupCode, merchantLocation, deliveryZone, confirmedReady } = this.data;
    const phoneOk = /^1[3-9]\d{9}$/.test(phone.trim());
    const valid = !!recipientName.trim() && phoneOk &&
      !!pickupCode.trim() && !!merchantLocation.trim() &&
      !!deliveryZone && confirmedReady;
    this.setData({ canSubmit: valid });
  },

  validateForm() {
    const { recipientName, phone, pickupCode, merchantLocation, deliveryZone, confirmedReady } = this.data;
    if (!recipientName.trim()) { wx.showToast({ title: '请输入收货人姓名', icon: 'none' }); return false; }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return false; }
    if (!pickupCode.trim()) { wx.showToast({ title: '请填写取餐码', icon: 'none' }); return false; }
    if (!merchantLocation.trim()) { wx.showToast({ title: '请填写取餐商家地点', icon: 'none' }); return false; }
    if (!deliveryZone) { wx.showToast({ title: '请选择送达园区', icon: 'none' }); return false; }
    if (!confirmedReady) { wx.showToast({ title: '请确认订单已出餐', icon: 'none' }); return false; }
    return true;
  },

  async submitOrder() {
    if (!this.validateForm()) return;
    if (this.data.paying) return;
    this.setData({ submitting: true });

    const finalPrice = this.data.price;

    try {
      const res = await wx.cloud.callFunction({
        name: 'createOrder',
        data: {
          orderType: 'selfpick',
          recipientName: this.data.recipientName.trim(),
          phone: this.data.phone.trim(),
          pickupCode: this.data.pickupCode.trim(),
          merchantLocation: this.data.merchantLocation.trim(),
          deliveryZone: this.data.deliveryZone,
          price: finalPrice,
          remark: this.data.remark.trim()
        },
        timeout: 15000
      });

      if (res.result && res.result.code === 0) {
        const orderId = res.result.data.orderId;
        this.saveUserProfile();
        if (res.result.data.free) {
          wx.showToast({ title: '订单创建成功', icon: 'success' });
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
      console.error('提交代取餐订单失败:', err);
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
