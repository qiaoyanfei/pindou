# 拼豆豆 · 云开发配置指南

## 1. 开通云开发

1. 打开微信开发者工具，导入本项目
2. 点击顶部 **云开发** → **开通**（按提示创建环境）
3. 复制环境 ID，填入 `src/config/cloud.ts`：

```typescript
export const CLOUD_ENV_ID = '你的环境ID'
```

## 2. 创建数据库集合

在云开发控制台 → 数据库，新建以下集合：

| 集合 | 说明 |
|------|------|
| `users` | 用户信息、小豆余额 |
| `posts` | 已发布图纸 |
| `drafts` | 待发布草稿 |
| `likes` | 点赞记录 |
| `favorites` | 收藏记录 |
| `downloads` | 下载记录 |
| `bean_transactions` | 小豆流水 |
| `feedbacks` | 问题反馈 |
| `app_config` | 运营配置（可选） |

### 推荐权限

- `users` / `drafts` / `feedbacks` / `bean_transactions`：**仅创建者可读写**
- `posts`：**所有用户可读，仅创建者可写**
- `likes` / `favorites` / `downloads`：**仅创建者可读写**

## 3. 部署云函数

1. 在微信开发者工具中右键 `cloudfunctions/api`
2. 选择 **上传并部署：云端安装依赖**
3. 等待部署完成

## 4. 初始化运营配置（可选）

在 `app_config` 集合手动添加一条记录：

```json
{
  "downloadCost": 2,
  "publishReward": 3,
  "registerReward": 5,
  "inviteReward": 5,
  "feedbackWechatId": "doudou_shouzuo",
  "feedbackQrUrl": "cloud://xxx/feedback/qrcode.png",
  "adminOpenIds": ["你的openid"]
}
```

`adminOpenIds` 必须是**数组**（不是字符串），openid 不要带 `oXXXX-` 这类占位前缀，需与云函数返回的完整 OpenID 完全一致。

不配置则使用代码内默认值。

## 5. 数据库索引（建议）

| 集合 | 索引字段 |
|------|----------|
| `posts` | `visibility` + `publishedAt`（降序） |
| `posts` | `visibility` + `likeCount`（降序） |
| `drafts` | `_openid` + `updatedAt`（降序） |
| `likes` | `_openid` + `postId` |
| `favorites` | `_openid` + `postId` |
| `bean_transactions` | `_openid` + `createdAt`（降序） |

## 6. 反馈二维码

将客服微信二维码上传到 **云存储**，把地址填入 `app_config.feedbackQrUrl`。

## 7. 编译与预览

```bash
npm run dev:weapp
```

确认 `project.config.json` 包含 `"cloudfunctionRoot": "cloudfunctions/"`。
