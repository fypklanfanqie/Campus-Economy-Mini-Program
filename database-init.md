# 数据库初始化说明

## 1. 创建集合

在微信开发者工具 → 云开发 → 数据库中创建以下集合：

1. **orders** - 订单集合（权限：仅创建者可读写）
2. **riders** - 骑手资料集合（权限：仅创建者可读写）
3. **withdrawals** - 提现记录集合（权限：仅创建者可读写）
4. **userProfiles** - 用户资料集合（权限：仅创建者可读写）
5. **paymentConfig** - 支付/管理员配置（权限：所有用户可读，仅管理员可写）
6. **blacklist** - 用户黑名单（权限：仅创建者可读写）

## 2. 初始化 paymentConfig

推荐用云函数 `initConfig` 一键完成（使用 app.js 中配置的你自己的云环境，无需手动建文档）：

1. 部署 `cloudfunctions/initConfig`（右键 → 上传并部署：云端安装依赖）。
2. 在云函数列表右键 `initConfig` → 调用/测试，传参 `{}`（默认 action=init）即可创建 `config` 文档。
   - 返回 `初始化成功，管理员密码已设为默认 admin123` 即完成。

`initConfig` 支持的 action（调用时通过 `data.action` 传入）：

| action | 作用 |
|--------|------|
| `init`（默认） | config 不存在则创建（密码 admin123），已存在则跳过，不覆盖现有配置 |
| `check` | 返回 config 是否存在、`passwordIsDefault`(密码是否为 admin123)、`adminOpenIds`，**不回传密码明文** |
| `set` | 将密码强制设为 admin123（不存在则先创建） |

手动创建方式（备选）：在 paymentConfig 集合添加一条 `_id` 为 `config` 的记录：

```json
{
  "_id": "config",
  "wechatPayQR": "",
  "alipayQR": "",
  "adminPassword": "admin123",
  "adminOpenIds": [],
  "createTime": "2026-06-27T00:00:00.000Z"
}
```

### 说明：
- `wechatPayQR`: 微信收款码的云存储 fileID，例 `cloud://YOUR_CLOUD_ENV.6c.../qrcode/wechat.png`
- `alipayQR`: 支付宝收款码的云存储 fileID
- `adminPassword`: 管理员密码，默认 `admin123`，请及时修改
- 若已用旧密码 `admin123` 初始化过，调用 `initConfig` 传 `{"action":"set"}` 即可把密码改为 `admin123`，无需去控制台手动改
- `adminOpenIds`: 管理员 openid 列表，首次验证密码后自动添加

## 3. 建立数据库索引（重要！不建索引会导致云函数超时）

在云开发控制台 → 数据库 → 对应集合 → 索引管理 中添加：

### orders 集合
- `status_createTime`：字段 `status`（升序）+ `createTime`（降序）→ 用于按状态查待接单
- `riderOpenid_createTime`：字段 `riderOpenid`（升序）+ `createTime`（降序）→ 用于查骑手配送单
- `userId_createTime`：字段 `userId`（升序）+ `createTime`（降序）→ 用于查用户订单

### riders 集合
- `_id`：主键索引（默认已有，无需创建）

### withdrawals 集合
- `riderOpenid_createTime`：字段 `riderOpenid`（升序）+ `createTime`（降序）

## 4. 上传收款码

1. 在云开发控制台 → 存储 → 上传微信/支付宝收款码图片
2. 复制图片的 File ID
3. 更新 `paymentConfig` 集合中 `config` 记录的 `wechatPayQR` / `alipayQR` 字段

## 5. 部署云函数

在微信开发者工具中，右键每个云函数目录 → 上传并部署（云端安装依赖）。
需要部署的云函数：
- createOrder
- getOrders
- getOrderDetail
- cancelOrder
- confirmPayment
- createWechatPayOrder
- queryWechatPayOrder
- getPaymentInfo
- adminGetOrders
- adminMarkUnpaid
- adminWithdrawals
- verifyAdmin
- saveUserProfile
- getUserProfile
- getFilePages
- getRiderHome
- registerRider
- acceptOrder
- riderUpdateStatus
- requestWithdrawal
