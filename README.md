# 🚀 宇宙无敌表达训练系统

> 👉 **在线体验版：[exprtrain.online](https://exprtrain.online)**，打开浏览器即用，支持中英双语。

一个帮你训练口语表达精准度的**本地桌面应用**：实时语音识别 → 词库匹配 → AI 反馈，全程离线 + 本地处理。

- 🎤 **实时语音识别**：基于 Sherpa-ONNX，完全离线，中文优化
- 📝 **全屏字幕显示**：黑底大字，实时显示你说的每一句话
- 🔍 **词库分析**：自动检测填充词、犹豫词、笼统词，给出精准替代
- 🤖 **AI 反馈**：支持 DeepSeek / OpenAI / 阿里百炼 Qwen / 智谱 GLM / Kimi / 豆包 / 硅基流动 / Ollama 多后端，可拉取模型列表
- 📊 **分析报告**：6 维度深度分析（逻辑 / 直接性 / 填充词 / 密度 / 词汇 / 亮点）

---

## 部署方式（二选一）

### ✅ 方式一：直接下载安装包（推荐，无需开发环境）

在 **GitHub Releases** 页面下载最新版：

| 版本 | 说明 |
|------|------|
| Windows 便携版 | 单个 exe，解压/双击即用 |
| Windows 安装版 | 安装到开始菜单 / 桌面 |

> 语音识别模型**已内置在安装包里（模型来自 GitHub Release / LFS）**，完全离线可用——不需要安装 Node.js，不需要联网下载模型。

**系统要求**：Windows 10+（x64）、麦克风权限。首次运行如出现 SmartScreen 提示，点「仍要运行」即可。

---

### 🛠 方式二：源码启动（开发者）

语音识别模型通过 **GitHub Release / LFS** 分发，**不放进代码仓库**，首次启动时自动获取。

#### Windows 一键启动（推荐，自动隐藏命令行窗口）

1. 下载 / 克隆本项目；
2. 双击根目录的 `start.vbs`（没有 `start.vbs` 则用 `start.bat`）；
3. 脚本自动完成四步：检测并安装 Node.js / npm（缺 wget 也会装）→ 下载语音识别模型 → `npm install` → 启动应用。

> 运行日志写入 `startup.log`；某一步失败会弹窗提示原因。

#### 通用手动流程（macOS / Linux / Windows）

```bash
# 1. 安装 Node.js 18+
cd expression-trainer

# 2. 安装依赖
npm install

# 3. 下载语音识别模型（来自 GitHub Release/LFS）
cd models
# 用 wget / curl 下载 tar.bz2 后解压，或直接运行一键脚本
wget https://github.com/by-2020-github/expression-trainer/releases/download/asr-model-v1/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2
tar xjf sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2
cd ..

# 4. 启动
npm start        # Windows 也可用 start.vbs
```

模型目录应为：

```
models/
└── sherpa-onnx-streaming-paraformer-bilingual-zh-en/
    ├── encoder.int8.onnx
    ├── decoder.int8.onnx
    └── tokens.txt
```

> 模型地址可在 `start.ps1` 顶部的 `$modelUrls` 数组调整（默认先本项目 Release，再上游 k2-fsa 兜底）；打包版应用内置模型，优先使用内置模型、无需下载。

---

## 配置 AI 后端

启动后点击右上角 ⚙️ 进入设置页，选择后端并填入 API Key（支持「🔄 获取模型列表」自动拉取可用模型），可勾选「思考 / 推理」开关。

> 推荐 DeepSeek：生成报告质量高、成本极低。

## 使用说明

1. **点击「开始录制」** → 对着麦克风说话
2. **实时字幕**会在屏幕中央显示你说的内容
3. **左侧面板**实时统计填充词 / 犹豫词 / 笼统词
4. **右侧面板**每 50 字给出 AI 实时反馈
5. **说完后点击「结束」** → 可点「生成报告」获取完整分析

## 字幕颜色含义

| 颜色 | 含义 |
|------|------|
| 🔴 红色波浪下划线 | 填充词（嗯、啊、那个、然后…） |
| 🟠 橙色 | 犹豫词（可能、也许、我觉得…） |
| 🟡 黄色虚线 | 笼统词（有精准替代建议） |
| 🟢 绿色 | 有力表达（好句子！） |

## 技术架构

```
┌─────────────────────────────────────────┐
│ Electron 主进程                          │
│  ├── Sherpa-ONNX (离线语音识别)          │
│  ├── 词库匹配 (emotion-lexicon.json)     │
│  └── AI反馈 (多后端 HTTP API)            │
├─────────────────────────────────────────┤
│ 渲染进程 (Chromium)                      │
│  ├── 全屏字幕显示                        │
│  ├── 实时统计面板                        │
│  └── 分析报告弹窗                        │
└─────────────────────────────────────────┘
```

## 词库说明

`data/emotion-lexicon.json` 基于大连理工情感词库 7 大类结构，包含：

- **130+ 情绪词**：分类（喜怒哀惧恶惊）+ 强度（1-9）
- **笼统词 → 精准词映射**：25 组高频替代建议
- **填充词表**：24 个常见口头禅
- **犹豫词表**：19 个弱化表达
- **程度词梯度**：弱 → 中 → 强 → 极 四级
- **画面化描述**：10 组「抽象 → 具象」转换
- **犹豫 → 直接转换**：8 组对照示例

## 开发

```bash
# 开发模式（带 DevTools）
npm run dev

# 目录结构
├── main.js              # Electron 主进程
├── preload.js           # preload 脚本
├── start.vbs / start.bat# Windows 一键启动（可选）
├── start.ps1            # 一键启动脚本逻辑
├── src/
│   ├── index.html       # 主界面
│   ├── settings.html    # 设置页
│   ├── styles.css       # 样式
│   ├── app.js           # 前端逻辑
│   └── settings.js      # 设置逻辑
├── lib/
│   ├── asr.js           # 语音识别
│   ├── lexicon.js       # 词库匹配
│   ├── ai-feedback.js   # AI 反馈
│   └── prompts.js       # Prompt 模板
├── data/
│   └── emotion-lexicon.json
└── models/              # Sherpa-ONNX 模型（Release/LFS 分发）
```

## 系统要求

- macOS 12+ / Windows 10+ / Linux
- Node.js 18+（仅源码启动需要）
- 麦克风权限
- （可选）网络连接（用于 AI 反馈；词库分析可离线）

## License

MIT
