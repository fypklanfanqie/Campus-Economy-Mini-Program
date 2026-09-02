// cloudfunctions/createOrder/index.js
// 创建订单云函数：校验参数，生成订单，返回订单号

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 如果没有获取到 openid，说明未登录
  if (!openid) {
    return { code: 401, message: '请先登录' };
  }

  try {
    // 检查用户是否被拉黑
    const blacklistCheck = await db.collection('blacklist')
      .where({ userId: openid, active: true })
      .get();
    if (blacklistCheck.data.length > 0) {
      return { code: 403, message: '您的账号已被限制使用，请联系客服' };
    }

    // ========== 参数提取与校验 ==========
    const {
      recipientName,
      phone,
      pickupCode,
      deliveryZone,
      packageSize,
      locationType,
      price,
      remark,
      // 打印订单参数
      orderType,
      fileID,
      fileName,
      fileType,
      filePages,
      copies,
      // 外卖代拿订单参数
      gateLocation,
      lockerCode,
      deliveryType,
      dormBuilding
    } = event;

    const isPrint = orderType === 'print';
    const isTakeout = orderType === 'takeout';
    const isSelfpick = orderType === 'selfpick';

    // 收件人 / 手机号：所有订单都需要
    if (!recipientName || !recipientName.trim()) {
      return { code: 1001, message: '请填写收货人姓名' };
    }
    if (!phone || !/^1[3-9]\d{9}$/.test(phone.trim())) {
      return { code: 1002, message: '请输入正确的手机号' };
    }

    const now = new Date();
    let finalPrice;
    let orderData;

    if (isTakeout) {
      // ========== 外卖代拿订单 ==========
      const GATES = ['北一门', '北二门', '西门', '南门'];
      if (!gateLocation || !GATES.includes(gateLocation)) {
        return { code: 1003, message: '请选择外卖所在校门' };
      }
      if (!['gate', 'dorm'].includes(deliveryType)) {
        return { code: 1004, message: '请选择送达方式' };
      }
      if (!deliveryZone || !deliveryZone.trim()) {
        return { code: 1005, message: '请选择送达园区' };
      }
      const gateFee = 1.5;   // 送到园区门口
      const dormFee = 2.0;   // 送到宿舍门口
      const expected = deliveryType === 'dorm' ? dormFee : gateFee;

      // 骑手收益 = 全额归骑手
      const takeoutIncome = expected;

      if (Math.abs(parseFloat(price) - expected) > 0.01) {
        return { code: 1006, message: `价格异常，期望金额：¥${expected}` };
      } else {
        finalPrice = expected;
      }

      orderData = {
        userId: openid,
        recipientName: recipientName.trim(),
        phone: phone.trim(),
        pickupCode: gateLocation + (lockerCode && lockerCode.trim() ? ' / 开柜码:' + lockerCode.trim() : ''),
        packageSize: 'takeout',
        locationType: 'onCampus',
        deliveryZone: deliveryZone.trim(),
        price: finalPrice,
        income: takeoutIncome,
        status: 'pending_payment',         // 初始状态：待付款
        createTime: now,
        payTime: null,
        acceptedBy: null,
        acceptedByName: 'NTU快递帮-小助手',
        acceptedByPhone: null,
        remark: (remark || '').trim().substring(0, 200),
        userNickname: event.userNickname || '',
        // 外卖代拿专属字段
        orderType: 'takeout',
        gateLocation: gateLocation,
        lockerCode: (lockerCode || '').trim(),
        deliveryType: deliveryType,        // gate（园区门口）| dorm（宿舍门口）
        dormBuilding: (dormBuilding || '').trim(),
        deliveryFee: finalPrice
      };
    } else if (isPrint) {
      // ========== 打印订单 ==========
      if (!fileID || !fileName) {
        return { code: 1003, message: '请先上传打印文件' };
      }
      const pages = parseInt(filePages, 10);
      if (!pages || pages < 1) {
        return { code: 1004, message: '文件页数无效' };
      }
      const copyCount = Math.max(1, parseInt(copies, 10) || 1);
      const unitPrice = 0.2;    // 每页 0.2 元
      const deliveryFee = 2.0;  // 配送费 2 元
      const expected = parseFloat((pages * copyCount * unitPrice + deliveryFee).toFixed(2));

      if (Math.abs(parseFloat(price) - expected) > 0.01) {
        return { code: 1005, message: `价格异常，期望金额：¥${expected}` };
      } else {
        finalPrice = expected;
      }

      // 骑手收益 = 用户应付金额 - 0.5（骑手酬劳与 income 一致）
      const printIncome = parseFloat((expected - 0.5).toFixed(2));

      orderData = {
        userId: openid,
        recipientName: recipientName.trim(),
        phone: phone.trim(),
        pickupCode: pickupCode ? pickupCode.trim() : '文件打印',
        packageSize: 'print',
        locationType: 'onCampus',
        deliveryZone: deliveryZone || '',
        price: finalPrice,
        income: printIncome,
        status: 'pending_payment',         // 初始状态：待付款
        createTime: now,
        payTime: null,
        acceptedBy: null,
        acceptedByName: 'NTU快递帮-小助手',
        acceptedByPhone: null,
        remark: (remark || '').trim().substring(0, 200),
        userNickname: event.userNickname || '',
        // 打印专属字段
        orderType: 'print',
        fileID: fileID,
        fileName: fileName,
        fileType: fileType || '',
        filePages: pages,
        copies: copyCount,
        unitPrice: unitPrice,
        deliveryFee: deliveryFee
      };
    } else if (isSelfpick) {
      // ========== 校内商家代取餐订单 ==========
      const merchantLocation = (event.merchantLocation || '').trim();
      if (!pickupCode || !pickupCode.trim()) {
        return { code: 1003, message: '请填写取餐码' };
      }
      if (!merchantLocation) {
        return { code: 1004, message: '请填写取餐商家地点' };
      }
      if (!deliveryZone || !deliveryZone.trim()) {
        return { code: 1005, message: '请选择送达园区' };
      }
      const selfpickPrice = 3.0;   // 统一价 ¥3/单，全校不加价
      const expected = selfpickPrice;

      if (Math.abs(parseFloat(price) - expected) > 0.01) {
        return { code: 1006, message: `价格异常，期望金额：¥${expected}` };
      } else {
        finalPrice = expected;
      }

      // 骑手酬劳 = 固定 ¥2.5/单
      const selfpickIncome = 2.5;

      orderData = {
        userId: openid,
        recipientName: recipientName.trim(),
        phone: phone.trim(),
        pickupCode: pickupCode.trim(),          // 取餐码
        merchantLocation: merchantLocation,     // 取餐商家地点（校内商家）
        packageSize: 'selfpick',
        locationType: 'onCampus',
        deliveryZone: deliveryZone.trim(),
        price: finalPrice,
        income: selfpickIncome,
        status: 'pending_payment',
        createTime: now,
        payTime: null,
        acceptedBy: null,
        acceptedByName: 'NTU快递帮-小助手',
        acceptedByPhone: null,
        remark: (remark || '').trim().substring(0, 200),
        userNickname: event.userNickname || '',
        orderType: 'selfpick'
      };
    } else {
      // ========== 快递订单（原有逻辑） ==========
      if (!pickupCode || !pickupCode.trim()) {
        return { code: 1003, message: '请填写取件码/货架号' };
      }
      if (!['small', 'medium', 'large'].includes(packageSize)) {
        return { code: 1004, message: '请选择包裹大小' };
      }
      if (!['onCampus', 'offCampus'].includes(locationType)) {
        return { code: 1005, message: '请选择地址类型' };
      }

      // 骑手收入规则：小件校内2.4/校外4.4，中件3.2/5.2，大件4.1/6.1
      const riderIncomeMap = {
        small: { onCampus: 2.4, offCampus: 4.4 },
        medium: { onCampus: 3.2, offCampus: 5.2 },
        large: { onCampus: 4.1, offCampus: 6.1 }
      };
      const expressIncome = riderIncomeMap[packageSize][locationType];

      const basePriceMap = {
        small: 2.9,
        medium: 3.9,
        large: 4.9
      };
      const basePrice = basePriceMap[packageSize];
      const extraFee = locationType === 'offCampus' ? 2.0 : 0;
      const expectedPrice = parseFloat((basePrice + extraFee).toFixed(1));

      if (Math.abs(parseFloat(price) - expectedPrice) > 0.01) {
        return {
          code: 1006,
          message: `价格异常，期望金额：¥${expectedPrice}`
        };
      }
      finalPrice = expectedPrice;

      orderData = {
        userId: openid,
        recipientName: recipientName.trim(),
        phone: phone.trim(),
        pickupCode: pickupCode.trim(),
        packageSize: packageSize,
        locationType: locationType,
        deliveryZone: deliveryZone || '',
        price: finalPrice,
        income: expressIncome,
        status: 'pending_payment',         // 初始状态：待付款
        createTime: now,
        payTime: null,                      // 付款时间初始为空
        acceptedBy: null,                  // 接单人openid初始为空
        acceptedByName: 'NTU快递帮-小助手',  // 默认接单员名称
        acceptedByPhone: null,             // 接单员电话
        remark: (remark || '').trim().substring(0, 200), // 备注最多200字
        userNickname: event.userNickname || '' // 用户昵称（前端可选传入）
      };
    }

    // 0 元订单（优惠场景）直接置为待接单（面单）状态，无需拉起支付
    const isFree = finalPrice === 0;
    if (isFree) {
      orderData.status = 'pending_pickup';
      orderData.payTime = now;
    }

    const result = await db.collection('orders').add({
      data: orderData
    });

    console.log('订单创建成功:', result._id, isFree ? '(免费订单，直接面单)' : '');

    return {
      code: 0,
      message: '订单创建成功',
      data: {
        orderId: result._id,
        price: finalPrice,
        free: isFree
      }
    };

  } catch (err) {
    console.error('创建订单异常:', err);
    return {
      code: 500,
      message: '服务器异常，请稍后重试'
    };
  }
};
