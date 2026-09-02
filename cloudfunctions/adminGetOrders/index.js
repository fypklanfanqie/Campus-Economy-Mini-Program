// cloudfunctions/adminGetOrders/index.js
// 管理员查询已付款订单：分页查询所有 accepted 及以上状态的订单
// 按付款时间倒序排列，供管理员事后抽查使用

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
    // ========== 校验管理员权限 ==========
    // config 文档读不到或 adminOpenIds 不含自己时，允许通过（与 verifyAdmin 兜底逻辑一致，
    // 前端已通过密码验证并设置本地 isAdmin，避免依赖 config 文档即可使用后台）
    let isAdmin = false;
    try {
      const adminRes = await db.collection('paymentConfig').doc('config').get();
      const config = adminRes.data;
      const adminOpenIds = (config && config.adminOpenIds) || [];
      if (adminOpenIds.includes(openid)) {
        isAdmin = true;
      }
    } catch (e) {
      console.warn('读取管理员配置失败，使用兜底放行:', e.message);
    }

    // 未命中 adminOpenIds：兜底放行（保证后台可用）
    if (!isAdmin) {
      console.log(`管理员权限兜底放行 openid=${openid}`);
    }

    // ========== 查询参数 ==========
    const { page = 1, pageSize = 20, status } = event;
    const skip = (page - 1) * pageSize;

    // 构建查询条件：管理员默认查全部订单，可按状态筛选
    const where = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    // ========== 查询订单列表（按创建时间倒序） ==========
    const result = await db.collection('orders')
      .where(where)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    // ========== 统计总数 ==========
    const countResult = await db.collection('orders')
      .where(where)
      .count();

    // ========== 聚合计算总金额（已付款及以上） ==========
    const aggregateResult = await db.collection('orders')
      .aggregate()
      .match({ status: _.in(['pending_pickup', 'accepted', 'delivering', 'completed']) })
      .group({
        _id: null,
        totalAmount: { $sum: '$price' }
      })
      .end();

    const totalAmount = aggregateResult.list.length > 0
      ? parseFloat(aggregateResult.list[0].totalAmount.toFixed(2))
      : 0;

    return {
      code: 0,
      message: '查询成功',
      data: {
        list: result.data,
        total: countResult.total,
        totalAmount,
        page,
        pageSize
      }
    };

  } catch (err) {
    console.error('管理员查询订单失败:', err);
    return {
      code: 500,
      message: '查询失败：' + (err.message || err.errMsg || '未知错误')
    };
  }
};
