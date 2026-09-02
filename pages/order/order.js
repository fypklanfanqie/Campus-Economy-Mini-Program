// pages/order/order.js - 下单页逻辑（一体化：选择包裹 + 表单填写）
Page({
  data: {
    // 包裹大小选择（页面内完成）
    size: '',
    locationType: '',

    // 价格映射
    basePriceMap: { small: 2.9, medium: 3.9, large: 4.9 },
    sizeTextMap: { small: '小件', medium: '中件', large: '大件' },
    locationTextMap: { onCampus: '校内', offCampus: '校外' },

    // 计算后的价格
    basePrice: 0,
    totalPrice: 0,
    totalPriceText: '0.0',

    // 表单数据
    recipientName: '',
    phone: '',
    pickupCode: '',
    deliveryZone: '',
    remark: '',

    // 园区选择器
    showZoneModal: false,
    zoneOptions: [
      '园区一', '园区二', '园区三', '园区四', '园区五', '园区六',
      '园区七', '园区八', '园区九', '园区十', '园区十一'
    ],

    // 状态控制
    submitting: false,
    paying: false
  },

  onLoad() {
    this.loadUserProfile();
  },

  // ========== 包裹大小与地址选择 ==========
  selectSize(e) {
    const size = e.currentTarget.dataset.size;
    const basePrice = this.data.basePriceMap[size];
    const totalPrice = this.calcTotalPrice(basePrice, this.data.locationType);
    this.setData({
      size,
      basePrice,
      totalPrice,
      totalPriceText: totalPrice.toFixed(1)
    });
  },

  selectLocation(e) {
    const type = e.currentTarget.dataset.type;
    const totalPrice = this.calcTotalPrice(this.data.basePrice, type);
    this.setData({
      locationType: type,
      totalPrice,
      totalPriceText: totalPrice.toFixed(1)
    });
  },

  calcTotalPrice(basePrice, locationType) {
    if (!basePrice) return 0;
    const extra = locationType === 'offCampus' ? 2.0 : 0;
    return basePrice + extra;
  },

  // ========== 加载用户历史信息 ==========
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
      if (res.result && res.result.code === 0 && res.result.data) {
        const profile = res.result.data;
        if (profile.recipientName) {
          this.setData({
            recipientName: profile.recipientName || '',
            phone: profile.phone || '',
            deliveryZone: profile.deliveryZone || ''
          });
          wx.setStorageSync('userProfile', profile);
        }
      }
    }).catch(err => {
      console.log('加载云端用户信息失败（首次使用正常）:', err.message);
    });
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

  // ========== 表单输入处理 ==========
  onNameInput(e) { this.setData({ recipientName: e.detail.value }); },
  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },
  onPickupCodeInput(e) { this.setData({ pickupCode: e.detail.value }); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  // ========== 园区选择器 ==========
  showZonePicker() { this.setData({ showZoneModal: true }); },
  closeZonePicker() { this.setData({ showZoneModal: false }); },
  selectZone(e) {
    const zone = e.currentTarget.dataset.zone;
    this.setData({ deliveryZone: zone, showZoneModal: false });
  },

  validateForm() {
    const { size, locationType, recipientName, phone, pickupCode, deliveryZone } = this.data;
    if (!size) { wx.showToast({ title: '请选择包裹大小', icon: 'none' }); return false; }
    if (!locationType) { wx.showToast({ title: '请选择地址类型', icon: 'none' }); return false; }
    if (!recipientName.trim()) { wx.showToast({ title: '请输入收货人姓名', icon: 'none' }); return false; }
    if (!phone.trim() || !/^1[3-9]\d{9}$/.test(phone.trim())) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return false; }
    if (!pickupCode.trim()) { wx.showToast({ title: '请输入取件码/货架号', icon: 'none' }); return false; }
    if (!deliveryZone) { wx.showToast({ title: '请选择送达园区', icon: 'none' }); return false; }
    return true;
  },

  /**
   * 提交订单 - 调用云函数 createOrder，成功后直接调起微信支付
   */
  async submitOrder() {
    if (!this.validateForm()) return;
    if (this.data.paying) return;
    this.setData({ submitting: true });

    try {
      const finalPrice = this.data.totalPrice;
      const res = await wx.cloud.callFunction({
        name: 'createOrder',
        data: {
          recipientName: this.data.recipientName.trim(),
          phone: this.data.phone.trim(),
          pickupCode: this.data.pickupCode.trim(),
          deliveryZone: this.data.deliveryZone,
          packageSize: this.data.size,
          locationType: this.data.locationType,
          price: finalPrice,
          remark: this.data.remark.trim()
        },
        timeout: 15000
      });

      console.log('创建订单结果:', res);

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
      console.error('提交订单失败:', err);
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
      const res = await wx.cloud.callFunction({
        name: 'createWechatPayOrder',
        data: { orderId },
        timeout: 30000
      });

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
          const q = await wx.cloud.callFunction({
            name: 'queryWechatPayOrder',
            data: { orderId },
            timeout: 30000
          });
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
  }
});
