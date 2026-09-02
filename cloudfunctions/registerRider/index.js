// cloudfunctions/registerRider/index.js
// 开通骑手：以 openid 作为文档 ID，写入 riders 集合

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 带超时的查询包装
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('query timeout')), ms))
  ]);
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { code: 401, message: '请先登录' };
  }

  try {
    const { riderName, riderPhone, nickName, avatarUrl } = event;

    if (!riderName || !riderName.trim()) {
      return { code: 1001, message: '请输入真实姓名' };
    }
    if (!riderPhone || !/^1[3-9]\d{9}$/.test(riderPhone.trim())) {
      return { code: 1002, message: '请输入正确的手机号' };
    }

    const now = new Date();
    const data = {
      _id: openid,
      riderName: riderName.trim(),
      riderPhone: riderPhone.trim(),
      isRider: true,
      balance: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      pendingWithdrawal: 0,
      createTime: now,
      updateTime: now
    };
    // 微信昵称/头像（一键登录获取，可选）
    if (typeof nickName === 'string' && nickName.trim()) {
      data.nickName = nickName.trim();
    }
    if (typeof avatarUrl === 'string' && avatarUrl.trim()) {
      data.avatarUrl = avatarUrl.trim();
    }

    // 若已有骑手文档，保留其历史累计金额（带超时保护）
    try {
      const exist = await withTimeout(db.collection('riders').doc(openid).get(), 3000);
      if (exist && exist.data) {
        data.balance = exist.data.balance || 0;
        data.totalEarned = exist.data.totalEarned || 0;
        data.totalWithdrawn = exist.data.totalWithdrawn || 0;
        data.pendingWithdrawal = exist.data.pendingWithdrawal || 0;
        data.createTime = exist.data.createTime || now;
      }
    } catch (e) {
      // 文档不存在或查询超时，使用默认初始值创建
    }

    // doc(openid) 已指定 _id，写入数据不能再带 _id，否则新版 SDK 报 -501007
    delete data._id;
    await db.collection('riders').doc(openid).set({ data });

    return { code: 0, message: '开通成功' };
  } catch (err) {
    console.error('开通骑手异常:', err);
    return { code: 500, message: '服务器异常: ' + (err.message || err.errMsg || JSON.stringify(err)) };
  }
};
