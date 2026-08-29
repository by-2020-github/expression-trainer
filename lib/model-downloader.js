/**
 * 语音识别模型 获取 / 校验 模块
 *
 * 模型来源按优先级尝试：
 *   1) 本地 tar.bz2（开发目录 / 用户数据目录 / resources），无需联网，直接解压
 *   2) GitHub Release 的 tar.bz2（用户上传后生效），下载后解压
 *   3) HuggingFace / hf-mirror 单文件（int8 量化版 ≈ 236MB），逐个下载
 *
 * 下载/解压后都会用官方源文件的确切字节数做完整性校验，避免截断文件导致
 * sherpa-onnx 报 "Please check your config!"。
 */

const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const unbzip2 = require('unbzip2-stream');
const tar = require('tar');

const MODEL_SUBDIR = 'sherpa-onnx-streaming-paraformer-bilingual-zh-en';
const TAR_NAME = `${MODEL_SUBDIR}.tar.bz2`;

// 实际运行所需的模型文件（与 lib/asr.js 对齐），minSize = 官方文件确切字节数
const MODEL_FILES = [
  { name: 'encoder.int8.onnx', minSize: 165462184 },
  { name: 'decoder.int8.onnx', minSize: 71664561 },
  { name: 'tokens.txt', minSize: 75756 },
];

// GitHub Release：请把本地 tar 上传到你自己的 release，并改这里（owner/repo/tag）。
const GITHUB_OWNER_REPO = 'by-2020-github/expression-trainer';
const GITHUB_RELEASE_TAG = 'asr-model-v1';
const GITHUB_TAR_URL = `https://github.com/${GITHUB_OWNER_REPO}/releases/download/${GITHUB_RELEASE_TAG}/${TAR_NAME}`;

// HuggingFace / hf-mirror（兜底，单文件下载）
const HF_BASE_URLS = [
  'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en/resolve/main',
  'https://hf-mirror.com/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en/resolve/main',
];

let electronApp = null;
try {
  electronApp = require('electron').app || null;
} catch (_e) {
  // 非 Electron 环境时忽略
}

function isPackaged() {
  return !!electronApp && !!electronApp.isPackaged;
}

/**
 * 本地 tar 候选路径：
 * - 开发：仓库 models/ 目录
 * - 打包：用户数据目录、resources 目录、exe 所在目录
 */
function getLocalTarCandidates() {
  const candidates = [];
  if (isPackaged() && electronApp) {
    candidates.push(path.join(electronApp.getPath('userData'), 'models', TAR_NAME));
    try {
      candidates.push(path.join(process.resourcesPath, 'models', TAR_NAME));
    } catch (_e) { /* ignore */ }
    try {
      candidates.push(path.join(path.dirname(process.execPath), 'models', TAR_NAME));
    } catch (_e) { /* ignore */ }
  } else {
    candidates.push(path.join(__dirname, '..', 'models', TAR_NAME));
  }
  return candidates;
}

/**
 * 获取用于下载/校验的网络实现。优先 Node 全局 fetch，退回 electron.net.fetch。
 */
function getFetch() {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch;
  try {
    const { net } = require('electron');
    if (net && typeof net.fetch === 'function') return net.fetch;
  } catch (_e) { /* ignore */ }
  throw new Error('当前运行环境不支持 fetch，无法下载模型');
}

/** 判断模型目录是否完整可用 */
function isModelReady(modelDir) {
  return MODEL_FILES.every((f) => {
    const p = path.join(modelDir, f.name);
    try {
      const st = fs.statSync(p);
      return st.isFile() && st.size >= f.minSize;
    } catch (_e) {
      return false;
    }
  });
}

/** 是否只需保留这几个文件以节省磁盘 */
function keepOnExtract(entryPath) {
  const base = path.posix.basename(entryPath);
  if (MODEL_FILES.some((f) => f.name === base)) return true;
  return base === MODEL_SUBDIR;
}

/**
 * 从 .tar.bz2 解压，只保留 int8 模型与 tokens.txt
 */
async function extractTar(tarPath, parentDir, onProgress) {
  fs.mkdirSync(parentDir, { recursive: true });
  let processed = 0;
  let lastReport = 0;
  const progress = new Transform({
    transform(chunk, _enc, cb) {
      processed += chunk.length;
      if (onProgress && processed - lastReport >= 8 * 1024 * 1024) {
        lastReport = processed;
        onProgress({
          state: 'downloading',
          file: '模型包',
          percent: 0,
          note: `正在解压模型…（已处理 ${Math.round(processed / 1024 / 1024)}MB）`,
        });
      }
      cb(null, chunk);
    },
  });
  await pipeline(
    fs.createReadStream(tarPath),
    unbzip2(),
    progress,
    tar.x({ cwd: parentDir, filter: keepOnExtract }),
  );
}

/**
 * 流式下载 URL 到 dest，并上报进度
 */
async function downloadFileTo(url, dest, onProgress) {
  const fetch = getFetch();
  const part = dest + '.part';
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  const body = Readable.fromWeb(res.body);
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (onProgress) {
        const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
        onProgress({ file: path.basename(dest), received, total, percent });
      }
      cb(null, chunk);
    },
  });

  await pipeline(body, counter, fs.createWriteStream(part));
  fs.renameSync(part, dest);
}

/**
 * 尝试从本地 tar 解压到 parentDir（modelDir 的父目录）
 */
async function tryLocalTar(modelDir, parentDir, onProgress) {
  for (const tarPath of getLocalTarCandidates()) {
    if (!fs.existsSync(tarPath)) continue;
    if (onProgress) {
      onProgress({ state: 'downloading', file: '本地模型包', percent: 0, note: '正在解压本地模型…' });
    }
    await extractTar(tarPath, parentDir, onProgress);
    if (isModelReady(modelDir)) return true;
  }
  return false;
}

/**
 * 尝试从 GitHub Release 下载 tar 并解压
 */
async function tryGitHubTar(modelDir, parentDir, onProgress) {
  if (onProgress) {
    onProgress({ state: 'downloading', file: 'GitHub 模型包', percent: 0, note: '从 GitHub 下载模型…' });
  }
  const tarPath = path.join(parentDir, TAR_NAME);
  await downloadFileTo(GITHUB_TAR_URL, tarPath, onProgress);
  try {
    await extractTar(tarPath, parentDir, onProgress);
    if (isModelReady(modelDir)) return true;
  } finally {
    try { fs.unlinkSync(tarPath); } catch (_e) { /* ignore */ }
  }
  return false;
}

/**
 * 兜底：从 HuggingFace / hf-mirror 逐个下载 int8 文件
 */
async function tryHfFiles(modelDir, onProgress) {
  fs.mkdirSync(modelDir, { recursive: true });
  const missing = MODEL_FILES.filter((f) => {
    const p = path.join(modelDir, f.name);
    return !(fs.existsSync(p) && fs.statSync(p).size >= f.minSize);
  });
  if (!missing.length) return true;

  const sizes = {};
  let overallTotal = 0;
  for (const f of missing) {
    let size = null;
    for (const base of HF_BASE_URLS) {
      try {
        const r = await fetch(`${base}/${f.name}`, { method: 'HEAD', redirect: 'follow' });
        if (r.ok) {
          const len = Number(r.headers.get('content-length'));
          size = Number.isFinite(len) && len > 0 ? len : null;
          if (size) break;
        }
      } catch (_e) { /* next */ }
    }
    sizes[f.name] = size || f.minSize;
    overallTotal += sizes[f.name];
  }

  let overallReceived = 0;
  for (const f of missing) {
    await downloadFileTo(
      `${HF_BASE_URLS[0]}/${f.name}`,
      path.join(modelDir, f.name),
      (p) => {
        const fileTotal = p.total || sizes[p.file];
        const soFar = overallReceived + p.received;
        const percent = overallTotal > 0 ? Math.min(100, Math.round((soFar / overallTotal) * 100)) : 0;
        if (onProgress) {
          onProgress({ state: 'downloading', file: p.file, overallReceived: soFar, overallTotal, percent });
        }
      },
    );
    overallReceived += fs.statSync(path.join(modelDir, f.name)).size;
  }
  return isModelReady(modelDir);
}

/**
 * 确保模型就绪：优先本地 tar，其次 GitHub，最后 HF 单文件
 * @returns {Promise<{ready: boolean, downloaded: boolean, source: string}>}
 */
async function ensureModel(modelDir, onProgress) {
  if (isModelReady(modelDir)) {
    return { ready: true, downloaded: false, source: 'cached' };
  }

  const parentDir = path.dirname(modelDir);
  fs.mkdirSync(parentDir, { recursive: true });

  // 1) 本地 tar
  if (await tryLocalTar(modelDir, parentDir, onProgress)) {
    return { ready: true, downloaded: true, source: 'local' };
  }
  // 2) GitHub Release
  try {
    if (await tryGitHubTar(modelDir, parentDir, onProgress)) {
      return { ready: true, downloaded: true, source: 'github' };
    }
  } catch (e) {
    if (onProgress) onProgress({ state: 'downloading', file: 'GitHub', percent: 0, note: `GitHub 下载失败，尝试其他源` });
  }
  // 3) HF 单文件
  if (await tryHfFiles(modelDir, onProgress)) {
    return { ready: true, downloaded: true, source: 'hf' };
  }

  if (onProgress) onProgress({ state: 'error', message: '模型获取失败，请检查网络后重试' });
  throw new Error('模型获取失败，请检查网络后重试');
}

module.exports = { MODEL_FILES, isModelReady, ensureModel, GITHUB_TAR_URL };
