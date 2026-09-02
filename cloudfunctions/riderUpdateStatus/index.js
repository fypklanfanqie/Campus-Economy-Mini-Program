// cloudfunctions/riderUpdateStatus/index.js
// 骑手更新配送状态：
//   action=deliver  -> 状态 accepted -> delivering
//   action=complete -> 状态 delivering -> completed，并给骑手结算收入

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { code: 401, message: '请先登录' };
  }

  try {
    const { orderId, action, deliveryPhoto } = event;
    if (!orderId) {
      return { code: 1001, message: '订单ID不能为空' };
    }
    if (!['deliver', 'complete'].includes(action)) {
      return { code: 1002, message: '未知操作' };
    }
    // 送达完成必须携带送达照片
    if (action === 'complete' && !deliveryPhoto) {
      return { code: 1008, message: '请先上传送达照片' };
    }

    // 校验骑手身份（用 doc().get() 走主键索引，最快）
    let rider;
    try {
      const riderRes = await db.collection('riders').doc(openid).get();
      rider = riderRes.data || null;
      if (!rider || !rider.isRider) {
        return { code: 1003, message: '骑手身份无效' };
      }
    } catch (e) {
      return { code: 1003, message: '骑手身份无效' };
    }

    // 查询订单
    const orderRes = await db.collection('orders').doc(orderId).get();
    const order = orderRes.data;
    if (!order) {
      return { code: 1004, message: '订单不存在' };
    }

    // 校验：必须是该订单的接单骑手
    if (order.riderOpenid !== openid) {
      return { code: 1005, message: '无权操作此订单' };
    }

    const now = new Date();

    // ========== 出发配送：accepted -> delivering ==========
    if (action === 'deliver') {
      if (order.status !== 'accepted') {
        return { code: 1006, message: '当前状态无法出发配送' };
      }
      await db.collection('orders').doc(orderId).update({
        data: {
          status: 'delivering',
          deliverTime: now,
          updateTime: now
        }
      });
      return { code: 0, message: '已出发配送', data: { status: 'delivering' } };
    }

    // ========== 送达完成：delivering -> completed，结算骑手收入 ==========
    if (order.status !== 'delivering') {
      return { code: 1007, message: '当前状态无法完成订单' };
    }

    const income = parseFloat((order.income || 0).toFixed(2));

    // 更新订单状态
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'completed',
        completeTime: now,
        updateTime: now,
        deliveryPhoto: deliveryPhoto || ''
      }
    });

    // 骑手收入入账：余额 + 累计收入
    if (income > 0) {
      await db.collection('riders').doc(openid).update({
        data: {
          balance: _.inc(income),
          totalEarned: _.inc(income),
          updateTime: now
        }
      });
    }

    return {
      code: 0,
      message: '已完成，收入已结算',
      data: { status: 'completed', income }
    };
  } catch (err) {
    console.error('骑手更新状态异常:', err);
    return { code: 500, message: '服务器异常' };
  }
};
