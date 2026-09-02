// pages/print/print.js - 文件打印下单页
Page({
  data: {
    // 文件信息
    fileInfo: {
      name: '',
      size: 0,
      sizeText: '',
      tempFilePath: '',
      fileID: '',
      fileType: ''   // doc / docx / pdf
    },
    // 页数解析
    pages: 0,
    needsManual: false,
    manualPages: '',   // 手动填写页数
    parsing: false,
    parseTip: '',

    // 计价规则
    unitPrice: 0.2,
    deliveryFee: 2.0,
    copies: 1,
    printFeeText: '0.00',
    deliveryFeeText: '2.00',
    totalPrice: 0,
    totalPriceText: '0.00',

    // 收货信息表单（复用快递逻辑）
    recipientName: '',
    phone: '',
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
    paying: false,
    canSubmit: false
  },

  onLoad() {
    this.loadUserProfile();
  },

  // ========== 用户信息 ==========
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

  // ========== 选择文件 ==========
  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['doc', 'docx', 'pdf'],
      success: (res) => {
        const file = res.tempFiles[0];
        const name = file.name || '未命名文件';
        const ext = name.split('.').pop().toLowerCase();
        if (!['doc', 'docx', 'pdf'].includes(ext)) {
          wx.showToast({ title: '仅支持 doc/docx/pdf', icon: 'none' });
          return;
        }
        // 重置解析状态
        this.setData({
          fileInfo: {
            name,
            size: file.size,
            sizeText: this.formatSize(file.size),
            tempFilePath: file.path,
            fileID: '',
            fileType: ext
          },
          pages: 0,
          needsManual: false,
          manualPages: '',
          parseTip: '',
          canSubmit: false
        });
        this.computePrice();
      },
      fail: () => {}
    });
  },

  // 重新选择
  rechooseFile() {
    this.chooseFile();
  },

  formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  },

  // ========== 解析页数 ==========
  async parsePages() {
    if (!this.data.fileInfo.tempFilePath) {
      wx.showToast({ title: '请先选择文件', icon: 'none' });
      return;
    }
    this.setData({ parsing: true, parseTip: '正在上传并解析页数...' });
    let up;
    try {
      // 1. 上传到云存储
      const ext = this.data.fileInfo.fileType;
      const cloudPath = `printFiles/${Date.now()}_${Math.floor(Math.random() * 1e6)}_${this.data.fileInfo.name}`;
      up = await wx.cloud.uploadFile({
        cloudPath,
        filePath: this.data.fileInfo.tempFilePath
      });
    } catch (err) {
      console.error('【第1步·上传文件超时/失败】与云函数无关，是 uploadFile 到云存储卡住：', err);
      this.setData({ parseTip: '文件上传失败，请检查网络后重试', needsManual: true });
      return;
    }

    try {
      // 2. 调用云函数解析页数（冷启动 npm install 较慢，客户端超时放宽到 60s）
      const res = await wx.cloud.callFunction({
        name: 'getFilePages',
        data: { fileID: up.fileID, fileName: this.data.fileInfo.name },
        timeout: 60000
      });

      if (res.result && res.result.code === 0) {
        const d = res.result.data || {};
        const pages = d.pages || 0;
        if (d.needsManual) {
          this.setData({
            pages: 0,
            needsManual: true,
            manualPages: pages > 0 ? String(pages) : '',
            parseTip: d.message || '请手动填写页数',
            'fileInfo.fileID': up.fileID
          });
          wx.showToast({ title: '请确认页数', icon: 'none' });
        } else {
          this.setData({
            pages: pages,
            needsManual: false,
            manualPages: '',
            parseTip: `已识别 ${pages} 页`,
            'fileInfo.fileID': up.fileID
          });
          wx.showToast({ title: `识别到 ${pages} 页`, icon: 'success' });
        }
        this.computePrice();
      } else {
        this.setData({ parseTip: res.result?.message || '解析失败，请手动填写', needsManual: true });
      }
    } catch (err) {
      console.error('【第2步·getFilePages调用超时/失败】云函数未响应：', err);
      this.setData({ parseTip: '解析失败，请手动填写页数', needsManual: true });
    } finally {
      this.setData({ parsing: false });
    }
  },

  // 手动填写页数
  onManualPagesInput(e) {
    const v = e.detail.value.replace(/[^\d]/g, '');
    this.setData({ manualPages: v });
    this.computePrice();
  },

  // 份数调整
  changeCopies(e) {
    const delta = parseInt(e.currentTarget.dataset.delta, 10);
    let c = this.data.copies + delta;
    if (c < 1) c = 1;
    if (c > 99) c = 99;
    this.setData({ copies: c });
    this.computePrice();
  },

  // 计算价格：页数 * 0.2 + 2（配送费）
  computePrice() {
    const pages = this.data.needsManual
      ? (parseInt(this.data.manualPages, 10) || 0)
      : this.data.pages;
    const copies = this.data.copies;
    const printFee = pages * copies * this.data.unitPrice;
    const total = printFee + this.data.deliveryFee;
    const valid = pages > 0;
    this.setData({
      printFeeText: printFee.toFixed(2),
      deliveryFeeText: this.data.deliveryFee.toFixed(2),
      totalPrice: total,
      totalPriceText: total.toFixed(2),
      canSubmit: valid
    });
  },

  // ========== 表单输入 ==========
  onNameInput(e) { this.setData({ recipientName: e.detail.value }); },
  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  // 园区选择
  showZonePicker() { this.setData({ showZoneModal: true }); },
  closeZonePicker() { this.setData({ showZoneModal: false }); },
  selectZone(e) {
    this.setData({ deliveryZone: e.currentTarget.dataset.zone, showZoneModal: false });
  },

  validateForm() {
    const { recipientName, phone, deliveryZone, fileInfo } = this.data;
    if (!fileInfo.fileID) {
      wx.showToast({ title: '请先上传并解析文件', icon: 'none' });
      return false;
    }
    if (!recipientName.trim()) {
      wx.showToast({ title: '请输入收货人姓名', icon: 'none' });
      return false;
    }
    if (!phone.trim() || !/^1[3-9]\d{9}$/.test(phone.trim())) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return false;
    }
    if (!deliveryZone) {
      wx.showToast({ title: '请选择送达园区', icon: 'none' });
      return false;
    }
    const pages = this.data.needsManual
      ? (parseInt(this.data.manualPages, 10) || 0)
      : this.data.pages;
    if (!pages || pages < 1) {
      wx.showToast({ title: '请确认文件页数', icon: 'none' });
      return false;
    }
    return true;
  },

  // ========== 提交订单 ==========
  async submitOrder() {
    if (!this.validateForm()) return;
    this.setData({ submitting: true });

    const pages = this.data.needsManual
      ? parseInt(this.data.manualPages, 10)
      : this.data.pages;
    const finalPrice = this.data.totalPrice;

    try {
      const res = await wx.cloud.callFunction({
        name: 'createOrder',
        data: {
          orderType: 'print',
          recipientName: this.data.recipientName.trim(),
          phone: this.data.phone.trim(),
          deliveryZone: this.data.deliveryZone,
          price: finalPrice,
          remark: this.data.remark.trim(),
          fileID: this.data.fileInfo.fileID,
          fileName: this.data.fileInfo.name,
          fileType: this.data.fileInfo.fileType,
          filePages: pages,
          copies: this.data.copies
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
        // 直接调起微信支付（免费订单云端自动确认）
        this.doPay(orderId);
      } else {
        wx.showToast({ title: res.result?.message || '创建订单失败', icon: 'none' });
      }
    } catch (err) {
      console.error('提交打印订单失败:', err);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
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

      // 免费订单已在云端直接确认，无需微信支付
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
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }); }
});
