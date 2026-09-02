# NTU快递帮 · 校园跑腿小程序

> 一个基于 **微信小程序 + 腾讯云开发（CloudBase）** 的校园跑腿/代拿平台。支持快递代拿、文件打印、外卖代拿、校内商家代取餐等场景，含骑手接单与提现、管理员后台、微信支付。

![GitHub License](https://img.shields.io/github/license/fypklanfanqie/Campus-Economy-Mini-Program)

## ⚠️ 开源与使用须知

本软件以 **开源形式公开**（MIT License），但附带以下附加限制，请在使用前仔细阅读：

1. **源代码开源**：欢迎查看、学习、fork 和修改。源码采用 [MIT License](./LICENSE)。
2. **禁止二次售卖**：**严禁**将本项目（含修改后的衍生版本）用于任何形式的销售、收费出售、商品化转卖或商业变现。违反者将被追究责任。
3. **商业使用须经许可**：任何**商业用途**（含运营、部署提供服务并产生收入）都须先通过 **GitHub Issues** 向我（项目维护者）提出申请，**经我明确同意后方可进行**。未经同意不得商用。
4. **保留署名**：衍生作品请保留原作者信息与版权声明。

> 简言之：**代码公开可学可改，但「拿去做生意」必须经过我的同意（Issues 申请）。**

## ✨ 功能

### 用户侧
- 🚚 **快递代拿**：选择包裹大小（小/中/大件）+ 校内/校外，系统自动计价并下单
- 🖨️ **文件打印**：上传 doc/docx/pdf，自动解析页数、选择份数，按页计价
- 🥡 **外卖代拿**：选择校门 + 送达方式（园区门口/宿舍门口）
- 🍱 **校内代取餐**：填写取餐码与商家地点，统一价配送
- 📋 订单列表与详情、取消订单、微信支付（微信支付 V3 JSAPI）

### 骑手侧
- 接单大厅：查看待接单、预估收入
- 我的配送：已接订单、配送状态更新
- 余额与提现申请

### 管理侧
- 管理员后台（`admin.html` + `pages/admin/dashboard`）
- 订单核查、标记未付款、用户拉黑
- 收款码等支付配置维护

### 设计
- iOS 18 风格玻璃拟态（Glassmorphism）UI
- 内联 SVG 图标组件、状态标签、毛玻璃列表等自定义组件
- 深/浅色主题自适应

## 🗂 项目结构

```
├── app.js / app.json / app.wxss   # 小程序入口、页面路由、全局样式
├── pages/                          # 页面
│   ├── index/                      # 首页（服务选择+计价）
│   ├── order/                      # 快递代拿下单
│   ├── print/                      # 文件打印下单
│   ├── takeout/                    # 外卖代拿下单
│   ├── selfpick/                   # 校内代取餐下单
│   ├── order-list/                 # 订单列表
│   ├── order-detail/               # 订单详情
│   ├── profile/                    # 个人中心（管理员/骑手入口）
│   ├── rider/                      # 骑手中心
│   └── admin/dashboard/            # 管理后台
├── components/                     # 自定义组件（icon/status-tag/glass-list…）
├── custom-tab-bar/                 # 自定义 TabBar
├── cloudfunctions/                 # 腾讯云开发云函数
│   ├── createOrder/                # 创建订单
│   ├── createWechatPayOrder/       # 微信支付统一下单
│   ├── confirmPayment/             # 确认付款
│   ├── queryWechatPayOrder/        # 查询支付结果
│   ├── cancelOrder/                # 取消订单
│   ├── getOrders/ getOrderDetail/  # 订单查询
│   ├── getRiderHome/               # 骑手中心数据
│   ├── acceptOrder/                # 骑手接单
│   ├── riderUpdateStatus/          # 骑手更新配送状态
│   ├── registerRider/              # 骑手注册
│   ├── requestWithdrawal/          # 提现申请
│   ├── adminGetOrders/             # 管理员查询
│   ├── adminMarkUnpaid/            # 标记未付款
│   ├── verifyAdmin/                # 管理员验证
│   └── getFilePages/               # 文件页数解析
├── images/                         # 图片资源
└── utils/                          # 工具（主题等）
```

## 🚀 快速开始

### 前置要求
- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（稳定版）
- 一个小程序 AppID（个人/企业均可）
- 开通**云开发（CloudBase）**环境

### 部署步骤

1. **导入项目**：微信开发者工具 → 导入项目 → 选择本仓库根目录
2. **配置 AppID**：在 `project.config.json` 中把 `appid` 改为你自己的（当前为占位 `touristappid`）
3. **配置云环境 ID**：将 `app.js` 与 `admin.html` 中的 `YOUR_CLOUD_ENV_ID` 替换为你的云开发环境 ID
4. **创建数据库集合**：参考 `database-init.md` 说明，创建 `orders / riders / withdrawals / users / blacklist / paymentConfig` 等集合
5. **部署云函数**：在微信开发者工具中，右键每个云函数目录 → 上传并部署（云端安装依赖）
6. **开通支付（可选）**：如需微信支付，在对应云函数环境变量中配置 `MCH_ID`（商户号）、`MCH_SERIAL_NO`（证书序列号）、`MERCHANT_PRIVATE_KEY_B64`（商户私钥 base64）、`WX_APPID`

### 本地开发
- `project.private.config.json` 为本地私有配置，已被 git 忽略，不会提交
- 「开发者免费后门」等私有逻辑已从公开仓库移除，请按需自行实现

## 🛠 常用云函数与集合

| 数据库集合 | 用途 |
|-----------|------|
| `orders` | 订单主表 |
| `riders` | 骑手资料与余额 |
| `withdrawals` | 提现记录 |
| `users` | 用户资料 |
| `blacklist` | 拉黑名单 |
| `paymentConfig` | 支付/管理员配置（收款码、管理员密码） |

> 管理员密码：默认 `admin123`，请在云数据库 `paymentConfig` 的 `config` 文档中修改，勿使用默认值。

## 📄 License

本项目采用 **MIT License**，并附加「禁止二次售卖 / 商业用途须经同意」条款，详见 [LICENSE](./LICENSE) 与上文「开源与使用须知」。

商业使用申请请通过 **GitHub Issues** 提出。

---

**Made with ❤️ · 仅供学习交流**
