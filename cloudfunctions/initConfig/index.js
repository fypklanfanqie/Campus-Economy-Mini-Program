// cloudfunctions/initConfig/index.js
// 管理员配置维护工具：
//   action 缺省 / 'init'  -> 创建 config 文档（密码默认 admin123，已存在则跳过，不覆盖）
//   action 'check'        -> 返回 config 是否存在、密码是否仍为默认值（不回传明文）
//   action 'set'          -> 将密码强制设为默认值（需先存在 config，不存在则先创建）
// 仅部署后手动调用，请部署到你自己的云开发环境。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DEFAULT_PASSWORD = 'admin123';

exports.main = async (event, context) => {
  const action = event.action || 'init';
  try {
    // 先查是否已有 config 文档
    let existing = null;
    try {
      const res = await db.collection('paymentConfig').doc('config').get();
      existing = res.data;
    } catch (e) {
      // 文档不存在
    }

    // ========== 检查当前密码状态 ==========
    if (action === 'check') {
      if (!existing) {
        return {
          code: 0,
          message: 'config 文档不存在，请先调用 init',
          data: { exists: false, passwordIsDefault: false, adminOpenIds: [] }
        };
      }
      return {
        code: 0,
        message: 'config 已存在',
        data: {
          exists: true,
          passwordIsDefault: existing.adminPassword === DEFAULT_PASSWORD,
          adminOpenIds: existing.adminOpenIds || []
        }
      };
    }

    // ========== 强制设置密码 ==========
    if (action === 'set') {
      if (!existing) {
        // 不存在先创建
        await db.collection('paymentConfig').add({
          data: {
            _id: 'config',
            wechatPayQR: '',
            alipayQR: '',
            adminPassword: DEFAULT_PASSWORD,
            adminOpenIds: [],
            createTime: new Date()
          }
        });
        return {
          code: 0,
          message: 'config 已创建并将密码设为 ' + DEFAULT_PASSWORD,
          data: { exists: false, passwordIsDefault: true, adminOpenIds: [] }
        };
      }
      await db.collection('paymentConfig').doc('config').update({
        data: { adminPassword: DEFAULT_PASSWORD, updateTime: new Date() }
      });
      return {
        code: 0,
        message: '管理员密码已设为 ' + DEFAULT_PASSWORD,
        data: {
          exists: true,
          passwordIsDefault: true,
          adminOpenIds: existing.adminOpenIds || []
        }
      };
    }

    // ========== 初始化（默认） ==========
    if (existing) {
      return {
        code: 0,
        message: 'config 已存在，无需重复初始化',
        data: {
          exists: true,
          passwordIsDefault: existing.adminPassword === DEFAULT_PASSWORD,
          adminOpenIds: existing.adminOpenIds || []
        }
      };
    }

    const now = new Date();
    await db.collection('paymentConfig').add({
      data: {
        _id: 'config',
        wechatPayQR: '',
        alipayQR: '',
        adminPassword: DEFAULT_PASSWORD,
        adminOpenIds: [],
        createTime: now
      }
    });

    return {
      code: 0,
      message: '初始化成功，管理员密码已设为 ' + DEFAULT_PASSWORD,
      data: {
        exists: false,
        passwordIsDefault: true,
        adminOpenIds: []
      }
    };
  } catch (err) {
    console.error('操作失败:', err);
    return {
      code: 500,
      message: '操作失败：' + (err.message || err.errMsg || '未知错误')
    };
  }
};
