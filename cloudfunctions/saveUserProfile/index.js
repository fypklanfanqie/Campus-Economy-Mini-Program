// cloudfunctions/saveUserProfile/index.js
// 保存用户收货信息（姓名、手机号），以 openid 为唯一标识

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
    const { recipientName, phone, deliveryZone, nickName, avatarUrl } = event;

    if (!recipientName || !phone) {
      return { code: 1001, message: '姓名和手机号不能为空' };
    }

    const now = new Date();

    // 组装要保存的用户资料（昵称/头像来自微信一键登录）
    const profile = {
      recipientName: recipientName.trim(),
      phone: phone.trim(),
      deliveryZone: deliveryZone || '',
      updateTime: now
    };
    // 昵称/头像若传入则一并保存（微信一键登录获取）
    if (typeof nickName === 'string' && nickName.trim()) {
      profile.nickName = nickName.trim();
    }
    if (typeof avatarUrl === 'string' && avatarUrl.trim()) {
      profile.avatarUrl = avatarUrl.trim();
    }

    // 使用 openid 作为文档 ID，存在则更新，不存在则创建
    try {
      await db.collection('userProfiles').doc(openid).update({ data: profile });
    } catch (e) {
      // 文档不存在，创建新记录
      await db.collection('userProfiles').add({
        data: Object.assign({ _id: openid, createTime: now }, profile)
      });
    }

    return {
      code: 0,
      message: '保存成功'
    };

  } catch (err) {
    console.error('保存用户档案失败:', err);
    return {
      code: 500,
      message: '保存失败'
    };
  }
};
