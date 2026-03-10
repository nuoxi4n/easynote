# EasyNote

一个极简的在线记事本，支持 API 访问、加密保护和 Markdown 渲染。

## 功能特性

- 📝 **即刻笔记** — 通过 URL 访问任意笔记 (`/my-note`)
- 🔌 **API 接口** — JSON/纯文本 API，方便 AI 或程序化调用
- 🔒 **加密保护** — 逐条笔记 AES-256-CBC 密码加密
- 📖 **Markdown** — 一键切换 Markdown 渲染预览
- 💾 **自动保存** — 停止键入 1.5 秒后自动保存
- ⌨️ **快捷键** — `Ctrl+S` 保存 / `Ctrl+M` Markdown / `Tab` 缩进
- 🌐 **多语言** — 支持中文和英文界面切换
- 🎨 **Zen-iOS 混合 UI** — 磨砂玻璃、冷灰色调、触觉反馈
- 📦 **零依赖** — 无需数据库、无需 CDN，所有资源本地化

## 系统要求

- PHP 7.4+ 且启用 OpenSSL 扩展
- Apache 启用 `mod_rewrite` **或** Nginx

## 安装部署

1. 将文件克隆或复制到 Web 服务器目录
2. 确保 `_notes/` 目录可写：`chmod 755 _notes/`
3. 启用 `mod_rewrite`（Apache）或配置 URL 重写（Nginx）
4. 访问你的站点即可使用！

### Nginx 配置

```nginx
location / {
    try_files $uri $uri/ /index.php?note=$uri&$args;
}

location ~ ^/_notes/ {
    deny all;
}
```

## 使用方式

| 操作 | URL |
|------|-----|
| 首页 | `/` |
| 打开/创建笔记 | `/my-note` |
| API 读取（JSON） | `/api/my-note` |
| API 读取（纯文本） | `/api/my-note?raw=1` |
| API 写入 | `POST /api/my-note` |

## API 接口

### 读取笔记

```bash
# JSON 格式
curl https://your-site.com/api/my-note

# 纯文本
curl https://your-site.com/api/my-note?raw=1

# 加密笔记
curl -H "X-Password: secret" https://your-site.com/api/my-note
```

**JSON 响应示例：**
```json
{
  "note": "my-note",
  "content": "Hello, World!",
  "exists": true,
  "encrypted": false,
  "length": 13,
  "modified": "2025-01-01T12:00:00+00:00"
}
```

### 写入笔记

```bash
# JSON 请求体
curl -X POST -H "Content-Type: application/json" \
  -d '{"content":"通过 API 写入"}' \
  https://your-site.com/api/my-note

# 带加密
curl -X POST -H "Content-Type: application/json" \
  -d '{"content":"加密笔记","password":"my-pass"}' \
  https://your-site.com/api/my-note

# 纯文本请求体
curl -X POST -d "通过 API 写入" \
  https://your-site.com/api/my-note
```

## 配置说明

编辑 `config.php`：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `$data_dir` | `_notes/` | 笔记存储目录 |
| `$site_title` | `EasyNote` | 站点标题 |
| `$default_lang` | `zh` | 默认语言 (`en` 或 `zh`) |
| `$allow_api` | `true` | 启用/禁用 API 访问 |

### 语言切换

- 在 `config.php` 中设置 `$default_lang` 指定默认语言
- 用户可通过页面上的语言切换按钮（🌐）手动切换
- 语言偏好通过 Cookie 保存 30 天
- 也可通过 URL 参数切换：`?lang=en` 或 `?lang=zh`

## 开源协议

MIT
