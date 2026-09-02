// cloudfunctions/adminMarkUnpaid/index.js
// 管理员标记订单为未付款：回退订单状态为 pending_payment
// 可选将用户加入黑名单，下次下单时拦截

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
    // ========== 校验管理员权限 ==========
    const adminRes = await db.collection('paymentConfig').doc('config').get();
    const config = adminRes.data;
    const adminOpenIds = config.adminOpenIds || [];

    if (!adminOpenIds.includes(openid)) {
      return { code: 403, message: '无管理员权限' };
    }

    const { orderId, blacklist = false } = event;

    if (!orderId) {
      return { code: 1001, message: '订单ID不能为空' };
    }

    // ========== 查询订单 ==========
    const orderRes = await db.collection('orders').doc(orderId).get();
    const order = orderRes.data;

    if (!order) {
      return { code: 1002, message: '订单不存在' };
    }

    // 只有已接单及之后的状态才能标记未付款
    const validStatuses = ['accepted', 'delivering', 'completed'];
    if (!validStatuses.includes(order.status)) {
      return { code: 1003, message: '该订单状态无法标记为未付款' };
    }

    // ========== 更新订单状态 ==========
    const now = new Date();
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'pending_payment',   // 回退为待付款
        payTime: null,               // 清除付款时间
        updateTime: now,
        markedUnpaid: true,          // 标记为被管理员回退
        markedBy: openid,           // 记录操作人
        markedTime: now             // 记录操作时间
      }
    });

    // ========== 可选：拉黑用户 ==========
    if (blacklist) {
      // 检查是否已存在拉黑记录
      const existingBlacklist = await db.collection('blacklist')
        .where({ userId: order.userId, active: true })
        .get();

      if (existingBlacklist.data.length === 0) {
        await db.collection('blacklist').add({
          data: {
            userId: order.userId,
            reason: `订单 ${orderId} 标记未付款，管理员 ${openid} 操作`,
            createTime: now,
            active: true
          }
        });
        console.log(`用户 ${order.userId} 已被拉黑，关联订单 ${orderId}`);
      }
    }

    console.log(`订单 ${orderId} 已被管理员 ${openid} 标记为未付款`);

    return {
      code: 0,
      message: '已标记为未付款' + (blacklist ? '，用户已被拉黑' : ''),
      data: {
        orderId,
        status: 'pending_payment',
        blacklisted: blacklist
      }
    };

  } catch (err) {
    console.error('标记未付款异常:', err);
    return {
      code: 500,
      message: '服务器异常，请稍后重试'
    };
  }
};
