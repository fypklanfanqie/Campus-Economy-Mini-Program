// cloudfunctions/getPaymentInfo/index.js
// 获取收款码信息：返回微信/支付宝收款码图片地址与转账备注规则

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    // 从 paymentConfig 集合获取收款码配置
    const res = await db.collection('paymentConfig').doc('config').get();

    if (!res.data) {
      return {
        code: 404,
        message: '收款码配置不存在，请联系管理员上传收款码'
      };
    }

    const config = res.data;

    return {
      code: 0,
      message: '获取成功',
      data: {
        // 收款码图片云存储 fileID
        wechatPayQR: config.wechatPayQR || '',
        alipayQR: config.alipayQR || '',
        // 转账备注规则
        remarkRule: '请在转账备注中填写订单号后6位数字',
        // 提示信息
        tips: '转账后请返回小程序点击"我已付款"即可自动确认'
      }
    };

  } catch (err) {
    console.error('获取收款码失败:', err);
    return {
      code: 500,
      message: '获取失败，请稍后重试'
    };
  }
};
