// pages/order-detail/order-detail.js - 订单详情页逻辑
Page({
  data: {
    loading: true,
    order: {},
    isPrint: false,
    isTakeout: false,
    isSelfpick: false,
    paying: false,

    // 状态文本映射
    statusTextMap: {
      pending_payment: '待付款',
      pending_pickup: '待接单',
      accepted: '已接单',
      delivering: '配送中',
      completed: '已完成',
      cancelled: '已取消'
    },
    statusDescMap: {
      pending_payment: '请点击「立即支付」完成付款',
      pending_pickup: '已付款，正在为您匹配骑手',
      accepted: '骑手已接单，请耐心等待',
      delivering: '配送员正在为您配送中',
      completed: '订单已完成',
      cancelled: '订单已取消'
    },
    sizeTextMap: {
      small: '小件（¥2.9）',
      medium: '中件（¥3.9）',
      large: '大件（¥4.9）'
    }
  },

  onLoad(options) {
    const { id, showPay } = options;
    this.orderId = id;
    this.shouldShowPay = showPay === 'true';
    this.loadOrderDetail();
  },

  async loadOrderDetail() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getOrderDetail',
        data: { orderId: this.orderId }
      });

      if (res.result && res.result.code === 0) {
        const order = res.result.data;
        order.createTimeText = this.formatTime(order.createTime);
        order.payTimeText = order.payTime ? this.formatTime(order.payTime) : '';

        // 送达照片：仅下单用户可见（云函数已按 userId 鉴权，他人调 getOrderDetail 取不到该订单）
        if (order.status === 'completed' && order.deliveryPhoto) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({ fileList: [order.deliveryPhoto] });
            const temp = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
            if (temp) order.deliveryPhotoUrl = temp;
          } catch (e) {
            // 取临时地址失败不阻塞详情页
          }
        }

        this.setData({
          order,
          isPrint: order.orderType === 'print',
          isTakeout: order.orderType === 'takeout',
          isSelfpick: order.orderType === 'selfpick'
        });

        // 从"我的订单-去付款"进入时自动调起支付
        if (this.shouldShowPay && order.status === 'pending_payment') {
          setTimeout(() => this.doPay(this.orderId), 500);
        }
      } else {
        wx.showToast({ title: '订单不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (err) {
      console.error('加载订单详情失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  },

  /**
   * 去付款：调起微信支付
   */
  showPayment() {
    if (this.data.order.status !== 'pending_payment') {
      wx.showToast({ title: '订单状态已变更，请刷新', icon: 'none' });
      return;
    }
    this.doPay(this.order._id);
  },

  /**
   * 调起微信支付：统一下单 -> wx.requestPayment -> 查单确认
   */
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
        setTimeout(() => this.loadOrderDetail(), 600);
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
          setTimeout(() => this.loadOrderDetail(), 800);
        },
        fail: (err) => {
          if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) {
            wx.showToast({ title: '已取消支付', icon: 'none' });
          } else {
            wx.showToast({ title: '支付失败', icon: 'none' });
          }
          this.setData({ paying: false });
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

  async cancelOrder() {
    if (this.data.order.status !== 'pending_payment') {
      wx.showToast({ title: '当前状态无法取消', icon: 'none' });
      return;
    }
    const confirm = await this.showConfirm('确定取消该订单吗？');
    if (!confirm) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'cancelOrder',
        data: { orderId: this.order._id }
      });
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '订单已取消', icon: 'success' });
        setTimeout(() => this.loadOrderDetail(), 800);
      } else {
        wx.showToast({ title: res.result?.message || '取消失败', icon: 'none' });
      }
    } catch (err) {
      console.error('取消订单失败:', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    }
  },

  showConfirm(content) {
    return new Promise(resolve => {
      wx.showModal({ title: '提示', content, success: res => resolve(res.confirm) });
    });
  },

  async previewFile() {
    const fileID = this.data.order.fileID;
    if (!fileID) { wx.showToast({ title: '文件不存在', icon: 'none' }); return; }
    wx.showLoading({ title: '加载中' });
    try {
      const urlRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const url = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
      if (!url) { wx.showToast({ title: '文件地址获取失败', icon: 'none' }); return; }
      const dl = await wx.downloadFile({ url });
      wx.openDocument({
        filePath: dl.tempFilePath,
        fileType: this.data.order.fileType || 'pdf',
        showMenu: true,
        fail: () => wx.showToast({ title: '该文件无法预览', icon: 'none' })
      });
    } catch (err) {
      wx.showToast({ title: '预览失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }); },

  previewDeliveryPhoto() {
    const url = this.data.order.deliveryPhotoUrl;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  }
});
