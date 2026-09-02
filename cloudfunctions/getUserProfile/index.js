// cloudfunctions/getUserProfile/index.js
// 获取用户历史收货信息（收货人姓名、手机号）

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
    // 以 openid 作为文档 ID 查询用户档案
    const res = await db.collection('userProfiles').doc(openid).get();

    if (res.data) {
      return {
        code: 0,
        message: '查询成功',
        data: {
          recipientName: res.data.recipientName || '',
          phone: res.data.phone || '',
          deliveryZone: res.data.deliveryZone || '',
          nickName: res.data.nickName || '',
          avatarUrl: res.data.avatarUrl || ''
        }
      };
    } else {
      return {
        code: 0,
        message: '暂无历史记录',
        data: { recipientName: '', phone: '', deliveryZone: '', nickName: '', avatarUrl: '' }
      };
    }
  } catch (err) {
    // 文档不存在也算正常（新用户）
    console.log('获取用户档案:', err.message);
    return {
      code: 0,
      message: '暂无历史记录',
      data: { recipientName: '', phone: '', deliveryZone: '' }
    };
  }
};
