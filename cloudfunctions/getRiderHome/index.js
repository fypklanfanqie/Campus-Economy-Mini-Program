// cloudfunctions/getRiderHome/index.js
// 骑手中心首页数据：骑手资料 + 可接订单 + 我的配送 + 提现记录
// light=true 时只返回骑手资料（用于个人中心判断）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 安全查询：集合不存在/查询失败时返回空数组，避免影响整体返回
async function safeGet(promise) {
  try {
    const res = await promise;
    return (res && res.data) || [];
  } catch (e) {
    console.warn('safeGet 失败(可能集合未创建):', e.message);
    return [];
  }
}

// 带超时的查询包装，防止单个查询卡死整个函数
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('query timeout')), ms))
  ]);
}

// 预估收入计算（用于待接单列表展示）
// 优先使用订单已计算的 income 字段（createOrder 已正确计算），
// 仅在历史订单缺少 income 字段时回退到规则估算。
function calcIncomePreview(order) {
  if (order.income != null && order.income !== undefined) return order.income;
  if (order.orderType === 'print') return 2.0;
  if (order.orderType === 'takeout') return order.deliveryFee || (order.deliveryType === 'dorm' ? 2.0 : 1.5);
  const incomeMap = {
    small: { onCampus: 2.4, offCampus: 4.4 },
    medium: { onCampus: 3.2, offCampus: 5.2 },
    large: { onCampus: 4.1, offCampus: 6.1 }
  };
  const loc = order.locationType || 'onCampus';
  return (incomeMap[order.packageSize] && incomeMap[order.packageSize][loc]) || 2.4;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { code: 401, message: '请先登录' };
  }

  try {
    const { light } = event;

    // ========== 骑手资料（用 doc().get() 走主键索引，最快） ==========
    let rider = null;
    try {
      const r = await withTimeout(db.collection('riders').doc(openid).get(), 3000);
      if (r.data && (r.data.isRider || r.data.riderName)) {
        const rd = r.data;
        rider = {
          riderName: rd.riderName,
          riderPhone: rd.riderPhone,
          balance: rd.balance || 0,
          totalEarned: rd.totalEarned || 0,
          totalWithdrawn: rd.totalWithdrawn || 0,
          pendingWithdrawal: rd.pendingWithdrawal || 0
        };
      }
    } catch (e) {
      // 非骑手或查询失败：保持 rider 为 null，由前端本地缓存兜底
      console.warn('查询骑手资料失败:', e.message);
    }

    // light 模式：只查骑手资料，立即返回（用于个人中心判断）
    if (light) {
      return { code: 0, message: 'ok', data: { rider: rider } };
    }

    let availableOrders = [];
    let myOrders = [];
    let withdrawals = [];

    if (rider) {
      // ========== 并行查询所有列表（Promise.all） ==========
      // 每个查询各自有 safeGet 兜底，且整体有 5 秒超时保护
      const [paidOrders, myOrdersRaw, withdrawalsRaw] = await Promise.all([
        // 1) 待接单（status 等值查询）
        safeGet(withTimeout(
          db.collection('orders')
            .where({ status: 'pending_pickup' })
            .orderBy('createTime', 'desc')
            .limit(50)
            .get(),
          5000
        )),
        // 2) 我的配送：我接的订单
        safeGet(withTimeout(
          db.collection('orders')
            .where({ riderOpenid: openid })
            .orderBy('createTime', 'desc')
            .limit(50)
            .get(),
          5000
        )),
        // 3) 提现记录（集合可能未创建，容错）
        safeGet(withTimeout(
          db.collection('withdrawals')
            .where({ riderOpenid: openid })
            .orderBy('createTime', 'desc')
            .limit(20)
            .get(),
          5000
        ))
      ]);

      // 待接单订单列表
      availableOrders = (paidOrders || []).filter((o) => o && o.status === 'pending_pickup');

      // 给待接单订单附加预估收入
      availableOrders = availableOrders.map((o) => {
        o.income = calcIncomePreview(o);
        return o;
      });

      myOrders = myOrdersRaw || [];
      withdrawals = withdrawalsRaw || [];

      // 为打印订单批量换取文件临时地址（走管理端权限，不受存储读写限制影响）
      const printOrders = myOrders.filter(o => o && o.orderType === 'print' && o.fileID);
      if (printOrders.length > 0) {
        try {
          const fileList = printOrders.map(o => o.fileID);
          const urlRes = await cloud.getTempFileURL({ fileList });
          const urlMap = {};
          (urlRes.fileList || []).forEach(f => { urlMap[f.fileID] = f.tempFileURL; });
          myOrders.forEach(o => {
            if (o.orderType === 'print' && o.fileID && urlMap[o.fileID]) {
              o.fileTempUrl = urlMap[o.fileID];
            }
          });
        } catch (e) {
          console.warn('换取打印文件临时地址失败:', e.message);
        }
      }
    }

    return {
      code: 0,
      message: 'ok',
      data: { rider: rider, availableOrders: availableOrders, myOrders: myOrders, withdrawals: withdrawals }
    };
  } catch (err) {
    console.error('获取骑手首页异常:', err);
    return { code: 500, message: '服务器异常: ' + err.message };
  }
};
