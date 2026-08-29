/**
 * 语音识别模块 - 基于 sherpa-onnx-node
 * 使用 streaming recognizer 实现实时中文语音识别
 * 录音通过 Electron 渲染进程的 Web Audio API 采集，音频数据通过 IPC 传入
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const modelDownloader = require('./model-downloader');

let recognizer = null;
let stream = null;
let isRunning = false;

const MODEL_SUBDIR = 'sherpa-onnx-streaming-paraformer-bilingual-zh-en';

// 运行中的下载任务（多个调用方共享，避免重复下载）
let modelEnsurePromise = null;

/**
 * 返回模型根目录：
 * - 打包运行：放在用户数据目录（无需管理员权限，可写）
 * - 开发运行：沿用仓库里的 models/ 目录（保持原有体验）
 */
function getModelsRoot() {
  if (app.isPackaged) {
    // 优先使用打包内置的模型（extraResources → resources/models），离线可用
    const bundledDir = path.join(process.resourcesPath, 'models');
    if (modelDownloader.isModelReady(path.join(bundledDir, MODEL_SUBDIR))) {
      return bundledDir;
    }
    // 兜底：用户数据目录（联网/GitHub/本地 tar 下载后）
    return path.join(app.getPath('userData'), 'models');
  }
  return path.join(__dirname, '..', 'models');
}

function getModelDir() {
  return path.join(getModelsRoot(), MODEL_SUBDIR);
}

function isModelReady() {
  return modelDownloader.isModelReady(getModelDir());
}

/**
 * 确保模型已就绪。缺失时联网下载（打包态才会触发）。
 * 并发调用会被合并到同一个 Promise 上。
 */
function ensureModelForRun(onProgress) {
  const modelDir = getModelDir();
  if (modelDownloader.isModelReady(modelDir)) {
    return Promise.resolve({ ready: true, downloaded: false });
  }
  if (!modelEnsurePromise) {
    modelEnsurePromise = modelDownloader
      .ensureModel(modelDir, onProgress)
      .finally(() => {
        modelEnsurePromise = null;
      });
  }
  return modelEnsurePromise;
}

/**
 * 检查模型文件是否存在
 */
function checkModels() {
  const modelDir = getModelDir();
  for (const f of modelDownloader.MODEL_FILES) {
    const fullPath = path.join(modelDir, f.name);
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `模型文件未找到: ${f.name}\n请确认 ${modelDir} 目录下有完整的模型文件`
      );
    }
    const size = fs.statSync(fullPath).size;
    if (size < f.minSize) {
      throw new Error(
        `模型文件不完整: ${f.name}（${size} 字节，期望至少 ${f.minSize}）\n请到设置页点击"下载 / 更新模型"重新下载`
      );
    }
  }
}

/**
 * 初始化 ASR 引擎
 */
async function initASR() {
  if (recognizer) {
    // 已初始化，重置stream即可
    stream = recognizer.createStream();
    isRunning = true;
    console.log('[ASR] 重用已有引擎，创建新stream');
    return;
  }

  // 首次运行：确保模型已就绪（打包态下载；开发态可本地 tar 解压）
  await ensureModelForRun();

  checkModels();

  const sherpa = require('sherpa-onnx-node');
  const modelDir = getModelDir();

  const config = {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80
    },
    modelConfig: {
      paraformer: {
        encoder: path.join(modelDir, 'encoder.int8.onnx'),
        decoder: path.join(modelDir, 'decoder.int8.onnx'),
      },
      tokens: path.join(modelDir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: false
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20
  };

  try {
    recognizer = new sherpa.OnlineRecognizer(config);
    stream = recognizer.createStream();
    isRunning = true;
    console.log('[ASR] 识别引擎初始化完成');
  } catch (error) {
    throw new Error(
      `语音识别模型加载失败（可能下载不完整）：${error.message}。请在设置页点击"下载 / 更新模型"重新下载`
    );
  }
}

/**
 * 接收渲染进程发来的音频数据进行识别
 * @param {Float32Array} samples - 16kHz 单声道音频采样
 * @returns {{ text: string, isFinal: boolean } | null}
 */
function feedAudio(samples) {
  if (!isRunning || !stream || !recognizer) return null;

  // sherpa-onnx-node API: acceptWaveform({ samples, sampleRate })
  stream.acceptWaveform({ samples, sampleRate: 16000 });

  while (recognizer.isReady(stream)) {
    recognizer.decode(stream);
  }

  const result = recognizer.getResult(stream);
  const text = (result.text || '').trim();
  const isEndpoint = recognizer.isEndpoint(stream);

  if (isEndpoint && text) {
    recognizer.reset(stream);
    return { text, isFinal: true };
  } else if (text) {
    return { text, isFinal: false };
  }

  return null;
}

/**
 * 停止识别
 * @returns {string} 最后的未确认文本
 */
function stopRecognition() {
  isRunning = false;

  let finalText = '';
  if (stream && recognizer) {
    stream.inputFinished();
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream);
    }
    const result = recognizer.getResult(stream);
    finalText = (result.text || '').trim();
    stream = null;
  }

  console.log('[ASR] 停止录制');
  return finalText;
}

module.exports = { initASR, feedAudio, stopRecognition, getModelDir, ensureModelForRun, isModelReady };
