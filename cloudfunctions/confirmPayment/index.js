// cloudfunctions/confirmPayment/index.js
// 支付确认（查单模式）：调用微信支付「查询订单」接口核实真实支付状态后再放行
// 已废除原「信任模式」（不再仅凭用户点击就确认付款）
// 环境变量：MCH_ID / MCH_SERIAL_NO / MERCHANT_PRIVATE_KEY_B64

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');
const https = require('https');

const MCH_ID = process.env.MCH_ID;
const SERIAL_NO = process.env.MCH_SERIAL_NO;
const MERCHANT_PRIVATE_KEY = process.env.MERCHANT_PRIVATE_KEY_B64
  ? Buffer.from(process.env.MERCHANT_PRIVATE_KEY_B64, 'base64').toString('utf8')
  : process.env.MERCHANT_PRIVATE_KEY;

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
  return { authorization };
}

function httpsRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { code: 401, message: '请先登录' };

  try {
    const { orderId } = event;
    if (!orderId) return { code: 1001, message: '订单ID不能为空' };

    const orderRes = await db.collection('orders').doc(orderId).get();
    const order = orderRes.data;
    if (!order) return { code: 1002, message: '订单不存在' };
    if (order.userId !== openid) return { code: 1003, message: '无权操作此订单' };

    // 已支付则幂等返回
    if (order.status !== 'pending_payment') {
      return { code: 0, message: '订单已支付', data: { paid: true, status: order.status } };
    }

    // 0 元订单（优惠场景）直接确认
    if (Math.round((order.price || 0) * 100) <= 0) {
      await db.collection('orders').doc(orderId).update({
        data: { status: 'pending_pickup', payTime: new Date(), updateTime: new Date() }
      });
      return { code: 0, message: '免费订单已确认', data: { paid: true } };
    }

    // 微信支付 V3 查询订单（按商户订单号）：
    //   签名串中的 urlPath 不含 query string，但实际请求 path 必须带 ?mchid=xxx
    const urlPath = `/v3/pay/transactions/out-trade-no/${String(orderId)}`;
    const { authorization } = buildAuthorization('GET', urlPath, '');
    const resp = await httpsRequest({
      hostname: 'api.mch.weixin.qq.com',
      port: 443,
      path: encodeURI(urlPath) + `?mchid=${MCH_ID}`,
      method: 'GET',
      headers: { Authorization: authorization, Accept: 'application/json', 'User-Agent': 'cloud-function' }
    });

    if (resp.statusCode !== 200) {
      console.error('查询订单失败:', resp.statusCode, resp.body);
      return { code: 1005, message: '未查到支付记录', data: { paid: false } };
    }

    const result = JSON.parse(resp.body);
    if (result.trade_state === 'SUCCESS') {
      await db.collection('orders').doc(orderId).update({
        data: {
          status: 'pending_pickup',
          payTime: new Date(),
          updateTime: new Date(),
          transactionId: result.transaction_id || ''
        }
      });
      return { code: 0, message: '支付确认成功', data: { paid: true } };
    }
    return { code: 1006, message: '订单未支付', data: { paid: false, tradeState: result.trade_state } };
  } catch (err) {
    console.error('确认付款异常:', err);
    return { code: 500, message: '服务器异常，请稍后重试' };
  }
};
