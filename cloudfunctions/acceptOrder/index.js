// cloudfunctions/acceptOrder/index.js
// 骑手接单：校验订单状态，计算骑手收入，分配骑手

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 骑手收入规则（元）
const INCOME = {
  onCampus: { small: 2.4, medium: 3.2, large: 4.1 },
  offCampus: { small: 4.4, medium: 5.2, large: 6.1 } // 校内 + 2 元
};

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { code: 401, message: '请先登录' };
  }

  try {
    const { orderId } = event;
    if (!orderId) {
      return { code: 1001, message: '订单ID不能为空' };
    }

    // 必须是已开通骑手（用 doc().get() 走主键索引，最快）
    let rider;
    try {
      const riderRes = await db.collection('riders').doc(openid).get();
      rider = riderRes.data || null;
    } catch (e) {
      return { code: 1002, message: '请先在骑手中心开通骑手' };
    }
    if (!rider || !rider.isRider) {
      return { code: 1002, message: '请先在骑手中心开通骑手' };
    }

    const orderRes = await db.collection('orders').doc(orderId).get();
    const order = orderRes.data;
    if (!order) {
      return { code: 1003, message: '订单不存在' };
    }
    if (order.status !== 'pending_pickup') {
      return { code: 1004, message: '该订单已被接单或状态异常' };
    }

    let income;
    // 优先使用订单已计算的 income 字段（createOrder 已正确计算）
    if (order.income != null && order.income !== undefined) {
      income = order.income;
    } else if (order.orderType === 'print') {
      // 历史打印订单兜底：配送费（¥2）归骑手
      income = order.deliveryFee || 2.0;
    } else if (order.orderType === 'takeout') {
      // 历史外卖订单兜底：配送费全额归骑手
      income = order.deliveryFee || order.price || 0;
    } else {
      const base = INCOME[order.locationType];
      income = base ? (base[order.packageSize] || 0) : 0;
    }

    const now = new Date();
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'accepted',
        riderOpenid: openid,
        riderName: rider.riderName,
        riderPhone: rider.riderPhone,
        acceptedByName: rider.riderName,
        acceptedByPhone: rider.riderPhone,
        income: parseFloat(income.toFixed(2)),
        acceptedTime: now,
        updateTime: now
      }
    });

    return {
      code: 0,
      message: '接单成功',
      data: { income: parseFloat(income.toFixed(2)) }
    };
  } catch (err) {
    console.error('骑手接单异常:', err);
    return { code: 500, message: '服务器异常' };
  }
};
