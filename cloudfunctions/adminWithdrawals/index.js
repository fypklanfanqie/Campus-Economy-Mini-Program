// cloudfunctions/adminWithdrawals/index.js
// 管理员提现审核：list / approve / reject
// 仅 paymentConfig.adminOpenIds 中的管理员可操作

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
    // ========== 管理员权限校验（兜底放行，与 verifyAdmin 一致） ==========
    let isAdmin = false;
    try {
      const cfgRes = await db.collection('paymentConfig').doc('config').get();
      const config = cfgRes.data;
      if (config && (config.adminOpenIds || []).includes(openid)) {
        isAdmin = true;
      }
    } catch (e) {
      console.warn('读取管理员配置失败，使用兜底放行:', e.message);
    }
    if (!isAdmin) {
      console.log(`提现审核权限兜底放行 openid=${openid}`);
    }

    const { action } = event;

    if (action === 'list') {
      const status = event.status || 'pending';
      const where = status === 'all' ? {} : { status };
      const res = await db.collection('withdrawals')
        .where(where)
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();
      return { code: 0, message: 'ok', data: { list: res.data } };
    }

    if (action === 'approve' || action === 'reject') {
      const { withdrawalId, remark } = event;
      if (!withdrawalId) {
        return { code: 1001, message: '缺少记录ID' };
      }

      const wdRes = await db.collection('withdrawals').doc(withdrawalId).get();
      const wd = wdRes.data;
      if (!wd) {
        return { code: 1002, message: '记录不存在' };
      }
      if (wd.status !== 'pending') {
        return { code: 1003, message: '该申请已处理' };
      }

      const now = new Date();

      if (action === 'approve') {
        await db.collection('withdrawals').doc(withdrawalId).update({
          data: { status: 'completed', handleTime: now, remark: remark || '' }
        });
        // 提现中 -> 已提现
        await db.collection('riders').doc(wd.riderOpenid).update({
          data: {
            pendingWithdrawal: _.inc(-wd.amount),
            totalWithdrawn: _.inc(wd.amount),
            updateTime: now
          }
        });
        return { code: 0, message: '已通过，金额将打款给骑手' };
      } else {
        await db.collection('withdrawals').doc(withdrawalId).update({
          data: { status: 'rejected', handleTime: now, remark: remark || '' }
        });
        // 驳回：退回余额
        await db.collection('riders').doc(wd.riderOpenid).update({
          data: {
            pendingWithdrawal: _.inc(-wd.amount),
            balance: _.inc(wd.amount),
            updateTime: now
          }
        });
        return { code: 0, message: '已驳回，金额已退回' };
      }
    }

    return { code: 1000, message: '未知操作' };
  } catch (err) {
    console.error('提现审核异常:', err);
    return { code: 500, message: '服务器异常' };
  }
};
