// cloudfunctions/createWechatPayOrder/index.js
// 微信支付 V3 JSAPI 统一下单：生成 wx.requestPayment 所需参数
// 敏感配置请在云函数「环境变量」中设置：
//   MCH_ID                  微信支付商户号
//   MCH_SERIAL_NO           商户 API 证书序列号
//   MERCHANT_PRIVATE_KEY_B64  apiclient_key.pem 内容做 base64 编码后的值
//   WX_APPID                小程序 appid
//   WX_NOTIFY_URL           （可选）支付结果通知地址

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');
const https = require('https');

const MCH_ID = process.env.MCH_ID;
const APPID = process.env.WX_APPID || '';
const SERIAL_NO = process.env.MCH_SERIAL_NO;
const MERCHANT_PRIVATE_KEY = process.env.MERCHANT_PRIVATE_KEY_B64
  ? Buffer.from(process.env.MERCHANT_PRIVATE_KEY_B64, 'base64').toString('utf8')
  : process.env.MERCHANT_PRIVATE_KEY;

// 生成调用微信支付 API 的 Authorization 头
function buildAuthorization(method, urlPath, bodyStr) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(message)
    .sign(MERCHANT_PRIVATE_KEY, 'base64');
  const authorization =
    `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",` +
    `nonce_str="${nonceStr}",signature="${signature}",` +
    `timestamp="${timestamp}",serial_no="${SERIAL_NO}"`;
  return { authorization, timestamp, nonceStr };
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { code: 401, message: '请先登录' };
  if (!MCH_ID || !SERIAL_NO || !MERCHANT_PRIVATE_KEY) {
    return { code: 500, message: '支付未配置：缺少商户号/证书序列号/私钥环境变量' };
  }

  try {
    const { orderId } = event;
    if (!orderId) return { code: 1001, message: '订单ID不能为空' };

    const orderRes = await db.collection('orders').doc(orderId).get();
    const order = orderRes.data;
    if (!order) return { code: 1002, message: '订单不存在' };
    if (order.userId !== openid) return { code: 1003, message: '无权操作此订单' };
    if (order.status !== 'pending_payment') {
      return { code: 1004, message: '订单状态异常，无需重复支付' };
    }

    const amount = Math.round((order.price || 0) * 100); // 单位：分
    // 0 元订单直接确认，不走微信支付
    if (amount <= 0) {
      await db.collection('orders').doc(orderId).update({
        data: { status: 'pending_pickup', payTime: new Date(), updateTime: new Date() }
      });
      return { code: 0, message: '免费订单已确认', data: { free: true } };
    }

    const outTradeNo = String(orderId); // 用订单 _id 作为商户订单号（唯一）
    const bodyObj = {
      appid: APPID,
      mchid: MCH_ID,
      description: '校园代拿服务',
      out_trade_no: outTradeNo,
      notify_url: process.env.WX_NOTIFY_URL || '',
      amount: { total: amount, currency: 'CNY' },
      payer: { openid }
    };
    const bodyStr = JSON.stringify(bodyObj);
    const urlPath = '/v3/pay/transactions/jsapi';
    const { authorization } = buildAuthorization('POST', urlPath, bodyStr);

    const resp = await httpsRequest(
      {
        hostname: 'api.mch.weixin.qq.com',
        port: 443,
        path: urlPath,
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'cloud-function'
        }
      },
      bodyStr
    );

    if (resp.statusCode !== 200) {
      console.error('统一下单失败:', resp.statusCode, resp.body);
      return { code: 500, message: '调用微信支付失败: ' + resp.body };
    }

    const result = JSON.parse(resp.body);
    const prepayId = result.prepay_id;
    if (!prepayId) return { code: 500, message: '未获取到 prepay_id' };

    // 构造前端 wx.requestPayment 所需参数
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const pkg = `prepay_id=${prepayId}`;
    const payMessage = `${APPID}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
    const paySign = crypto
      .createSign('RSA-SHA256')
      .update(payMessage)
      .sign(MERCHANT_PRIVATE_KEY, 'base64');

    return {
      code: 0,
      message: 'success',
      data: {
        timeStamp,
        nonceStr,
        package: pkg,
        signType: 'RSA',
        paySign
      }
    };
  } catch (err) {
    console.error('创建支付订单异常:', err);
    return { code: 500, message: '服务器异常: ' + err.message };
  }
};
