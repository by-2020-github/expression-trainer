/**
 * AI反馈模块 - 支持多后端（OpenAI 兼容协议）
 * 支持 DeepSeek / OpenAI / 阿里百炼 Qwen / 智谱 GLM / Kimi / 豆包 / 硅基流动 / Ollama / 自定义
 */

const { getRealtimePrompt, getReportPrompt } = require('./prompts');
const { PROVIDERS } = require('./providers');

/**
 * 从扁平化的 settings（含 provider 及其字段）解析出对话配置
 * settings 形如 { provider, apiKey, model, ollamaUrl, baseUrl, customModel, thinking, ... }
 */
function getProviderConfig(settings) {
  const provider = settings.provider;
  const meta = PROVIDERS[provider] || PROVIDERS.custom;

  let endpoint;
  switch (provider) {
    case 'ollama':
      endpoint = `${(settings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '')}/v1/chat/completions`;
      break;
    case 'custom': {
      const base = (settings.baseUrl || '').replace(/\/+$/, '');
      endpoint = base ? `${base}/chat/completions` : '';
      break;
    }
    default:
      endpoint = meta.chatUrl || '';
  }

  return {
    provider,
    endpoint,
    apiKey: settings.apiKey || '',
    model: settings.model || meta.defaultModel || 'gpt-4o-mini',
    thinking: !!settings.thinking,
    thinkingParam: meta.thinkingParam,
  };
}

/**
 * 将"思考"开关注入到请求体。各平台字段不同，按 providers.js 的 thinkingParam 映射。
 */
function applyThinking(body, config) {
  const tp = config.thinkingParam;
  if (!tp) return;
  if (config.thinking) {
    body[tp.key] = tp.on;
  } else if (tp.off !== null) {
    body[tp.key] = tp.off;
  }
  // tp.off === null 时关闭状态不传该字段（交给平台默认）
}

/**
 * 发送请求到 OpenAI 兼容接口
 * @param {Object} config - getProviderConfig 的返回值
 */
async function callAPI(config, messages, maxTokens = 200) {
  if (!config.endpoint) {
    throw new Error('端点地址未配置');
  }

  const body = {
    model: config.model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
  };
  applyThinking(body, config);

  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content;
}

/**
 * 发送实时反馈请求
 */
async function sendFeedback(text, settings, customPrompt) {
  const config = getProviderConfig(settings);
  const prompt = getRealtimePrompt(text, null, customPrompt);
  const messages = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  const result = await callAPI(config, messages, 150);
  return result;
}

/**
 * 发送结束报告请求
 */
async function sendReport(fullText, stats, settings, customPrompt) {
  const config = getProviderConfig(settings);
  const prompt = getReportPrompt(fullText, stats, customPrompt);
  const messages = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  const result = await callAPI(config, messages, 8192);
  return result;
}

/**
 * 将AI返回的纯文本反馈格式化为HTML
 */
function formatFeedback(text) {
  let html = text
    .replace(/→/g, '<span class="suggestion"> → </span>')
    .replace(/⚠️/g, '<span class="issue">⚠️</span>')
    .replace(/✓/g, '<span class="suggestion">✓</span>')
    .replace(/\n/g, '<br>');
  return html;
}

/**
 * 测试 LLM 连通性
 */
async function testConnection(settings) {
  const config = getProviderConfig(settings);
  if (!config.endpoint) {
    return { success: false, error: '端点地址未配置' };
  }

  const messages = [{ role: 'user', content: 'OK' }];
  try {
    await callAPI(config, messages, 2);
    return { success: true };
  } catch (error) {
    return { success: false, error: `连接失败: ${error.message}` };
  }
}

/**
 * 通过标准 /models 协议拉取模型列表
 * @param {Object} config - { provider, apiKey, baseUrl, ollamaUrl }
 */
async function listModels(config) {
  const provider = config.provider;
  const meta = PROVIDERS[provider] || PROVIDERS.custom;

  let url;
  if (provider === 'ollama') {
    url = `${(config.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '')}/v1/models`;
  } else if (provider === 'custom') {
    const base = (config.baseUrl || '').replace(/\/+$/, '');
    url = base ? `${base}/models` : '';
  } else {
    url = meta.modelsUrl || '';
  }
  if (!url) return { success: false, error: '未配置模型列表地址' };

  const headers = {};
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`获取模型列表失败 (HTTP ${response.status})`);
  }

  const data = await response.json();
  const list = (data.data || data.models || []).map((m) => ({
    value: m.id,
    label: m.id,
  }));
  return { success: true, models: list };
}

module.exports = { sendFeedback, sendReport, testConnection, listModels, getProviderConfig };
