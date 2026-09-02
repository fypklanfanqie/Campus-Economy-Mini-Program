// cloudfunctions/cancelOrder/index.js
// 取消订单：仅限待付款状态才能取消

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

    // 查询订单
    const orderRes = await db.collection('orders').doc(orderId).get();
    const order = orderRes.data;

    if (!order) {
      return { code: 1002, message: '订单不存在' };
    }

    // 校验订单归属
    if (order.userId !== openid) {
      return { code: 1003, message: '无权操作此订单' };
    }

    // 只有待付款状态才能取消
    if (order.status !== 'pending_payment') {
      return { code: 1004, message: '订单已接单，无法取消' };
    }

    // 更新订单状态为已取消
    const now = new Date();
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'cancelled',
        updateTime: now
      }
    });

    console.log(`订单 ${orderId} 已取消`);

    return {
      code: 0,
      message: '订单已取消',
      data: {
        orderId,
        status: 'cancelled'
      }
    };

  } catch (err) {
    console.error('取消订单异常:', err);
    return {
      code: 500,
      message: '服务器异常，请稍后重试'
    };
  }
};
