// cloudfunctions/getOrderDetail/index.js
// 获取订单详情：根据订单ID查询，校验归属权限

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
    const res = await db.collection('orders').doc(orderId).get();

    if (!res.data) {
      return { code: 1002, message: '订单不存在' };
    }

    const order = res.data;

    // 权限校验：只能查看自己的订单
    // 管理员可以查看任何订单（通过 isAdmin 标记）
    // 接单骑手可以查看自己负责的订单（riderOpenid 或 acceptedBy）
    if (order.userId !== openid && !event.isAdmin &&
        order.riderOpenid !== openid && order.acceptedBy !== openid) {
      return { code: 1003, message: '无权查看此订单' };
    }

    return {
      code: 0,
      message: '查询成功',
      data: order
    };

  } catch (err) {
    console.error('查询订单详情失败:', err);
    return {
      code: 500,
      message: '查询失败，请稍后重试'
    };
  }
};
