/**
 * AI 供应商元数据（OpenAI 兼容协议）
 *
 * 每个平台都可：
 * - 通过 chatUrl 发对话（/chat/completions）
 * - 通过 modelsUrl 拉取模型列表（/models），从而让用户选择而非手动输入
 * - 可选支持"思考/推理"开关（thinkingParam）
 *
 * 注意：thinkingParam 各平台字段名不同，这里做映射；不确定的平台置 null，避免发错参数。
 */

const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek（推荐）',
    keyHint: '在 platform.deepseek.com 获取',
    needsKey: true,
    defaultModel: 'deepseek-chat',
    chatUrl: 'https://api.deepseek.com/v1/chat/completions',
    modelsUrl: 'https://api.deepseek.com/models',
    // DeepSeek 的推理由模型决定（deepseek-reasoner），无独立开关参数
    thinkingParam: null,
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat（快速）' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner（思考）' },
    ],
  },
  openai: {
    label: 'OpenAI',
    keyHint: '在 platform.openai.com 获取',
    needsKey: true,
    defaultModel: 'gpt-4o-mini',
    chatUrl: 'https://api.openai.com/v1/chat/completions',
    modelsUrl: 'https://api.openai.com/v1/models',
    thinkingParam: { key: 'reasoning_effort', on: 'high', off: null },
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini（推荐）' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'o3-mini', label: 'o3-mini（思考）' },
    ],
  },
  qwen: {
    label: '阿里百炼 Qwen（通义）',
    keyHint: '在阿里云百炼控制台获取',
    needsKey: true,
    defaultModel: 'qwen-plus',
    chatUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    modelsUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    thinkingParam: { key: 'enable_thinking', on: true, off: false },
    models: [
      { value: 'qwen-plus', label: 'Qwen Plus（推荐）' },
      { value: 'qwen-max', label: 'Qwen Max' },
      { value: 'qwen3-235b-a22b', label: 'Qwen3-235B（思考）' },
    ],
  },
  zhipu: {
    label: '智谱 GLM',
    keyHint: '在 open.bigmodel.cn 获取',
    needsKey: true,
    defaultModel: 'glm-4-flash',
    chatUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    modelsUrl: 'https://open.bigmodel.cn/api/paas/v4/models',
    thinkingParam: { key: 'thinking', on: { type: 'enabled' }, off: { type: 'disabled' } },
    models: [
      { value: 'glm-4-flash', label: 'GLM-4 Flash（快）' },
      { value: 'glm-4-plus', label: 'GLM-4 Plus' },
      { value: 'glm-4.5', label: 'GLM-4.5（思考）' },
    ],
  },
  moonshot: {
    label: '月之暗面 Kimi',
    keyHint: '在 platform.moonshot.cn 获取',
    needsKey: true,
    defaultModel: 'moonshot-v1-8k',
    chatUrl: 'https://api.moonshot.cn/v1/chat/completions',
    modelsUrl: 'https://api.moonshot.cn/v1/models',
    thinkingParam: { key: 'thinking', on: { type: 'enabled' }, off: { type: 'disabled' } },
    models: [
      { value: 'moonshot-v1-8k', label: 'Moonshot v1 8K' },
      { value: 'kimi-k2-0711', label: 'Kimi K2（思考）' },
    ],
  },
  doubao: {
    label: '火山方舟 豆包',
    keyHint: '在火山引擎方舟控制台获取',
    needsKey: true,
    defaultModel: 'doubao-seed-1-6-250615',
    chatUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    modelsUrl: 'https://ark.cn-beijing.volces.com/api/v3/models',
    thinkingParam: null,
    models: [
      { value: 'doubao-seed-1-6-250615', label: '豆包 Seed 1.6' },
    ],
  },
  siliconflow: {
    label: '硅基流动 SiliconFlow',
    keyHint: '在 cloud.siliconflow.cn 获取',
    needsKey: true,
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    chatUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    modelsUrl: 'https://api.siliconflow.cn/v1/models',
    thinkingParam: null,
    models: [
      { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
    ],
  },
  ollama: {
    label: 'Ollama（本地）',
    keyHint: '本地运行 $ ollama serve',
    needsKey: false,
    defaultModel: 'qwen2.5:7b',
    // 地址由用户在 ollamaUrl 填写
    chatUrl: '',
    modelsUrl: '',
    thinkingParam: null,
    models: [
      { value: 'qwen2.5:7b', label: 'Qwen 2.5 7B（推荐）' },
      { value: 'llama3.1:8b', label: 'Llama 3.1 8B' },
      { value: 'mistral:7b', label: 'Mistral 7B' },
    ],
  },
  custom: {
    label: '自定义 OpenAI 兼容',
    keyHint: '自定义 API Key',
    needsKey: true,
    defaultModel: '',
    chatUrl: '',
    modelsUrl: '',
    thinkingParam: null,
    models: [],
  },
};

module.exports = { PROVIDERS };
