# Social AI 后端备份

这是 **Project2 Social AI 的 Go 后端源码备份**。

来源：GCE VM `socialai`（`melody@8.235.22.212`，区域 `us-west1-b`）上的
`/home/melody/go/src/socialai`，取出时间 **2026-09-15**。
备份原因：把云上的代码落到 GitHub 保管，避免云服务停止后丢失。

## 还原凭据（必读）

`conf/deploy.yml` **没有进版本库**（已写进 `.gitignore`）。拉下来之后要先照模板建一份，
否则后端起不来：

```bash
cp conf/deploy.yml.example conf/deploy.yml
$EDITOR conf/deploy.yml
```

里面要填的是 3 处**真实凭据**：

| 文件 | 位置 | 说明 |
|---|---|---|
| `conf/deploy.yml` | `elasticsearch.password` | Elasticsearch 密码 |
| `conf/deploy.yml` | `token.secret` | JWT 签名密钥 |
| `constants/constants.go` | `ES_PASSWORD` | ES 密码的代码内兜底值，和配置文件填同一个值 |

`util/yaml.go` 只把 3 个**非敏感**配置开放了环境变量覆盖（`GEMINI_API_KEY`、
`GOOGLE_CLOUD_PROJECT`、`SEMANTIC_BACKFILL_ON_STARTUP`），**ES 密码和 JWT 密钥不在其中**，
所以只能写回 `conf/deploy.yml`。

## 没有入库的东西

| 文件 | 大小 | 原因 |
|---|---|---|
| `socialai_lesson36` | 49 MB | 编译产物，可由源码重新构建 |
| `socialai_lesson36.pre-semantic` | 49 MB | 同上（旧的、语义检索之前的二进制） |
| `socialai.log` | 252 B | 运行日志，不该进版本库 |
| `.git/` | — | 打包时排除，所以这份备份**没有历史提交记录** |

## 目录结构

```
main.go                 入口，读 conf/deploy.yml 并启动 :8080
conf/deploy.yml.example 配置模板；真文件已 gitignore，不入库
constants/              常量
util/yaml.go            配置加载
model/                  数据模型
handler/                HTTP 路由与处理器
service/                业务逻辑（含语义检索 semantic.go）
backend/                Elasticsearch 与 GCS 后端
SEMANTIC_SEARCH.md      语义检索功能的说明
```

## 构建与运行

```bash
cd backend
go mod download
go build -o socialai .
./socialai
```

需要能访问 `conf/deploy.yml` 里配置的 Elasticsearch（GCE 内网地址）与 GCS 桶。
`backend/gcs.go` 用的是 GCE 服务账号的 Application Default Credentials，本地跑需要单独提供。
