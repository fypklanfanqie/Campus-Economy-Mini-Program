// cloudfunctions/requestWithdrawal/index.js
// 骑手申请提现：校验余额，创建提现记录，冻结金额（余额->提现中）
// 提现门槛：20 元（与前端 WITHDRAW_THRESHOLD 一致）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const WITHDRAW_THRESHOLD = 20;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { code: 401, message: '请先登录' };
  }

  try {
    const { amount } = event;
    const amt = parseFloat(amount);
    if (!(amt > 0)) {
      return { code: 1001, message: '请输入提现金额' };
    }
    if (amt < WITHDRAW_THRESHOLD) {
      return { code: 1002, message: `满¥${WITHDRAW_THRESHOLD}可提现` };
    }

    // 查询骑手资料（用 doc().get() 走主键索引，最快）
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

    const balance = parseFloat(rider.balance || 0);
    if (amt > balance + 0.001) {
      return { code: 1004, message: '超过可提现余额' };
    }

    const now = new Date();

    // 创建提现记录
    const withdrawData = {
      riderOpenid: openid,
      riderName: rider.riderName || '',
      riderPhone: rider.riderPhone || '',
      amount: parseFloat(amt.toFixed(2)),
      status: 'pending', // pending / completed / rejected
      createTime: now,
      updateTime: now
    };

    const addRes = await db.collection('withdrawals').add({ data: withdrawData });

    // 冻结金额：余额减少，提现中增加
    await db.collection('riders').doc(openid).update({
      data: {
        balance: _.inc(-parseFloat(amt.toFixed(2))),
        pendingWithdrawal: _.inc(parseFloat(amt.toFixed(2))),
        updateTime: now
      }
    });

    return {
      code: 0,
      message: '申请已提交',
      data: {
        withdrawalId: addRes._id,
        amount: parseFloat(amt.toFixed(2))
      }
    };
  } catch (err) {
    console.error('申请提现异常:', err);
    return { code: 500, message: '服务器异常' };
  }
};
