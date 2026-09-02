// cloudfunctions/getOrders/index.js
// 查询用户订单列表：按 openid 查询，支持状态筛选和分页

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
    const {
      status,      // 筛选状态：all / pending_payment / accepted / delivering / completed / cancelled
      page = 1,
      pageSize = 20,
      withStats = false // 是否返回统计信息
    } = event;

    const skip = (page - 1) * pageSize;

    // ========== 构建查询条件 ==========
    const where = { userId: openid };
    if (status && status !== 'all') {
      where.status = status;
    }

    // ========== 查询订单列表 ==========
    const result = await db.collection('orders')
      .where(where)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    const list = result.data;

    // ========== 如果需要统计信息 ==========
    let stats = null;
    if (withStats) {
      const statuses = ['pending_payment', 'pending_pickup', 'accepted', 'delivering', 'completed', 'cancelled'];

      // 分别统计各状态的数量
      const statPromises = statuses.map(s =>
        db.collection('orders')
          .where({ userId: openid, status: s })
          .count()
      );

      const statResults = await Promise.all(statPromises);
      stats = {};
      statuses.forEach((s, i) => {
        stats[s] = statResults[i].total;
      });
    }

    return {
      code: 0,
      message: '查询成功',
      data: {
        list,
        stats,
        total: list.length,
        page,
        pageSize,
        _openid: openid // 前端可用此获取openid
      }
    };

  } catch (err) {
    console.error('查询订单列表失败:', err);
    return {
      code: 500,
      message: '查询失败，请稍后重试'
    };
  }
};
