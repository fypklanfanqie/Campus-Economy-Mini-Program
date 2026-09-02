// cloudfunctions/verifyAdmin/index.js
// 验证管理员密码：校验密码是否正确，校验成功后记录管理员登录态

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
    const { password } = event;

    if (!password) {
      return { code: 1001, message: '请输入密码' };
    }

    // ========== 获取配置中的管理员密码 ==========
    // config 文档读不到（集合/文档不存在、权限问题等）时，用默认密码兜底，保证验证可用
    const DEFAULT_ADMIN_PASSWORD = 'admin123';
    let config = null;
    let adminPassword = DEFAULT_ADMIN_PASSWORD;
    try {
      const cfgRes = await db.collection('paymentConfig').doc('config').get();
      config = cfgRes.data;
      if (config && config.adminPassword) {
        adminPassword = config.adminPassword;
      }
    } catch (e) {
      // 读取失败：使用默认密码兜底，不阻断验证
      console.warn('读取 paymentConfig 失败，使用默认密码兜底:', e.message);
    }

    // 管理员密码（缺省为 admin123，实际以 config 中 adminPassword 为准）

    // ========== 校验密码 ==========
    if (password !== adminPassword) {
      return { code: 1002, message: '密码错误' };
    }

    // ========== 记录管理员登录 ==========
    // 仅当 config 文档存在时才写回 openid，避免文档缺失时报错
    if (config) {
      const adminOpenIds = config.adminOpenIds || [];
      if (!adminOpenIds.includes(openid)) {
        adminOpenIds.push(openid);
        try {
          await db.collection('paymentConfig').doc('config').update({
            data: {
              adminOpenIds: adminOpenIds,
              updateTime: new Date()
            }
          });
          console.log(`新管理员 ${openid} 已添加`);
        } catch (e) {
          console.warn('写回 adminOpenIds 失败（不影响验证）:', e.message);
        }
      }
    }

    return {
      code: 0,
      message: '验证成功',
      data: {
        isAdmin: true,
        openid: openid
      }
    };

  } catch (err) {
    console.error('管理员验证异常:', err);
    return {
      code: 500,
      message: '验证失败，请稍后重试'
    };
  }
};
