// 设置页逻辑

// 供应商展示顺序
const PROVIDER_ORDER = ['deepseek', 'qwen', 'zhipu', 'moonshot', 'doubao', 'siliconflow', 'openai', 'ollama', 'custom'];

class SettingsPage {
  constructor() {
    this.providerSelect = document.getElementById('provider');
    this.apikeyInput = document.getElementById('apikey');
    this.apikeyHint = document.getElementById('apikey-hint');
    this.modelSelect = document.getElementById('model');
    this.modelHint = document.getElementById('model-hint');
    this.customModelInput = document.getElementById('custom-model');
    this.ollamaUrlInput = document.getElementById('ollama-url');
    this.customBaseUrlInput = document.getElementById('custom-base-url');
    this.thinkingInput = document.getElementById('thinking');
    this.btnFetchModels = document.getElementById('btn-fetch-models');
    this.btnSave = document.getElementById('btn-save');
    this.saveSuccess = document.getElementById('save-success');

    this.groupApikey = document.getElementById('group-apikey');
    this.groupModel = document.getElementById('group-model');
    this.groupCustomModel = document.getElementById('group-custom-model');
    this.groupOllama = document.getElementById('group-ollama');
    this.groupCustom = document.getElementById('group-custom');

    this.asrModelStatus = document.getElementById('asr-model-status');
    this.asrDlProgress = document.getElementById('asr-dl-progress');
    this.asrDlFill = document.getElementById('asr-dl-fill');
    this.asrDlPercent = document.getElementById('asr-dl-percent');
    this.asrModelError = document.getElementById('asr-model-error');
    this.btnDownloadModel = document.getElementById('btn-download-model');

    this.providers = {};
    this.settings = null;

    this.bindEvents();
    this.init();
  }

  bindEvents() {
    this.providerSelect.addEventListener('change', () => this.onProviderChange());
    this.modelSelect.addEventListener('change', () => this.onModelChange());
    this.btnFetchModels.addEventListener('click', () => this.fetchModels());
    this.btnSave.addEventListener('click', () => this.save());
    this.btnDownloadModel.addEventListener('click', () => this.downloadModel());
  }

  async init() {
    // 拉取供应商元数据
    const providers = await window.api.getProviders();
    this.providers = providers || {};

    // 填充供应商下拉框
    this.populateProviderOptions();

    this.settings = await window.api.getSettings();
    this.providerSelect.value = this.settings.provider || 'deepseek';
    this.onProviderChange();

    // 语音识别模型状态
    this.initModelSection();
  }

  populateProviderOptions() {
    this.providerSelect.innerHTML = '';
    for (const key of PROVIDER_ORDER) {
      const p = this.providers[key];
      if (!p) continue;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = p.label;
      this.providerSelect.appendChild(opt);
    }
  }

  /** 加载指定 provider 的配置到表单字段 */
  loadProviderFields(provider) {
    const pc = this.settings?.providers?.[provider] || {};
    this.apikeyInput.value = pc.apiKey || '';
    this.ollamaUrlInput.value = pc.ollamaUrl || 'http://localhost:11434';
    this.customBaseUrlInput.value = pc.baseUrl || '';
    this.customModelInput.value = pc.customModel || '';
    this.thinkingInput.checked = !!pc.thinking;

    const model = pc.model || '';
    if (provider === 'custom') {
      this.customModelInput.value = model || pc.customModel || '';
    } else {
      const options = Array.from(this.modelSelect.options).map((o) => o.value);
      if (options.includes(model)) {
        this.modelSelect.value = model;
      } else if (model) {
        this.modelSelect.value = '__custom__';
        this.customModelInput.value = model;
      }
    }
  }

  onProviderChange() {
    const provider = this.providerSelect.value;
    const meta = this.providers[provider] || this.providers.custom;

    this.groupApikey.classList.toggle('visible', !!meta.needsKey);
    this.groupOllama.classList.toggle('visible', provider === 'ollama');
    this.groupCustom.classList.toggle('visible', provider === 'custom');
    this.groupCustomModel.classList.toggle('visible', provider === 'custom');
    this.groupModel.style.display = provider === 'custom' ? 'none' : '';

    if (meta.keyHint) this.apikeyHint.textContent = meta.keyHint;

    // 填充模型下拉框
    this.modelSelect.innerHTML = '';
    this.addModelOption('__custom__', '✍️ 手动输入模型名');
    (meta.models || []).forEach((m) => this.addModelOption(m.value, m.label));

    // 思考选项提示
    const thinkingLabel = document.getElementById('thinking-label');
    if (thinkingLabel) {
      thinkingLabel.textContent = meta.thinkingParam
        ? `开启思考（${meta.label} 支持）`
        : `开启思考（${meta.label} 主要通过选择对应模型生效）`;
    }

    this.loadProviderFields(provider);
    this.onModelChange();
  }

  onModelChange() {
    this.groupCustomModel.classList.toggle('visible', this.modelSelect.value === '__custom__');
  }

  addModelOption(value, label) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    this.modelSelect.appendChild(opt);
  }

  async fetchModels() {
    const provider = this.providerSelect.value;
    this.btnFetchModels.disabled = true;
    this.btnFetchModels.textContent = '⏳ 获取中…';
    this.modelHint.textContent = '';
    this.modelHint.style.color = '';

    const config = {
      provider,
      apiKey: this.apikeyInput.value.trim(),
      baseUrl: this.customBaseUrlInput.value.trim(),
      ollamaUrl: this.ollamaUrlInput.value.trim(),
    };

    const result = await window.api.listModels(config);
    this.btnFetchModels.disabled = false;
    this.btnFetchModels.textContent = '🔄 获取模型列表';

    if (!result.success) {
      this.modelHint.textContent = `获取失败：${result.error}`;
      this.modelHint.style.color = '#ff6b6b';
      return;
    }
    if (!result.models.length) {
      this.modelHint.textContent = '该平台未返回可用模型列表';
      this.modelHint.style.color = '#ff6b6b';
      return;
    }

    // 用接口返回的模型列表重填下拉框，保留当前选择
    const current = this.modelSelect.value;
    this.modelSelect.innerHTML = '';
    this.addModelOption('__custom__', '✍️ 手动输入模型名');
    result.models.forEach((m) => this.addModelOption(m.value, m.label));
    if (result.models.some((m) => m.value === current)) {
      this.modelSelect.value = current;
    }
    this.modelHint.textContent = `已获取 ${result.models.length} 个模型`;
    this.modelHint.style.color = '#69db7c';
  }

  // ===== 语音识别模型下载 =====

  async initModelSection() {
    window.api.onASRModelProgress((p) => this.handleAsrProgress(p));
    const { ready } = await window.api.checkASRModel();
    this.asrModelStatus.textContent = ready ? '✅ 模型已就绪' : '模型未下载，可点击下方下载（约 236MB）';
    this.asrModelStatus.style.color = ready ? '#69db7c' : '#888';
    this.asrModelError.textContent = '';
  }

  handleAsrProgress(p) {
    if (p.state === 'downloading') {
      this.asrDlProgress.classList.remove('hidden');
      const percent = p.percent || 0;
      if (this.asrDlFill) this.asrDlFill.style.width = `${percent}%`;
      if (this.asrDlPercent) this.asrDlPercent.textContent = `${percent}%`;
      this.asrModelStatus.textContent = '正在下载语音识别模型…';
      this.asrModelStatus.style.color = '#ffd60a';
      this.asrModelError.textContent = '';
    } else if (p.state === 'done') {
      this.asrDlProgress.classList.add('hidden');
      this.asrModelStatus.textContent = '✅ 模型已就绪';
      this.asrModelStatus.style.color = '#69db7c';
      this.btnDownloadModel.disabled = false;
      this.btnDownloadModel.textContent = '⬇ 下载 / 更新模型';
    } else if (p.state === 'error') {
      this.asrDlProgress.classList.add('hidden');
      this.asrModelStatus.textContent = '下载失败';
      this.asrModelStatus.style.color = '#ff6b6b';
      this.asrModelError.textContent = p.message || '下载失败';
      this.btnDownloadModel.disabled = false;
      this.btnDownloadModel.textContent = '⬇ 下载 / 更新模型';
    }
  }

  async downloadModel() {
    this.btnDownloadModel.disabled = true;
    this.btnDownloadModel.textContent = '⏳ 下载中…';
    this.asrDlProgress.classList.remove('hidden');
    this.asrModelError.textContent = '';
    if (this.asrDlFill) this.asrDlFill.style.width = '0%';
    if (this.asrDlPercent) this.asrDlPercent.textContent = '0%';

    const result = await window.api.startASRDownload();
    this.btnDownloadModel.disabled = false;
    this.btnDownloadModel.textContent = '⬇ 下载 / 更新模型';

    if (!result.success) {
      this.asrModelError.textContent = result.error || '下载失败';
      this.asrModelStatus.textContent = '下载失败';
      this.asrModelStatus.style.color = '#ff6b6b';
      this.asrDlProgress.classList.add('hidden');
    }
    // 成功状态由 onASRModelProgress 的 done 事件更新
  }

  async save() {
    const provider = this.providerSelect.value;
    const errorEl = document.getElementById('connection-error');
    errorEl.classList.remove('show');
    errorEl.textContent = '';

    const settings = await window.api.getSettings();
    settings.provider = provider;
    if (!settings.providers) settings.providers = {};

    const base = {
      apiKey: this.apikeyInput.value.trim(),
      ollamaUrl: this.ollamaUrlInput.value.trim(),
      baseUrl: this.customBaseUrlInput.value.trim(),
      thinking: this.thinkingInput.checked,
    };

    if (provider === 'custom') {
      const model = this.customModelInput.value.trim();
      settings.providers[provider] = { ...base, model, customModel: model };
    } else {
      let model = this.modelSelect.value;
      if (model === '__custom__') {
        model = this.customModelInput.value.trim();
        settings.providers[provider] = { ...base, model, customModel: model };
      } else {
        settings.providers[provider] = { ...base, model, customModel: '' };
      }
    }

    await window.api.saveSettings(settings);
    this.settings = settings;

    // 测试连通性
    this.btnSave.textContent = '⏳ 测试连接中...';
    this.btnSave.classList.add('loading');
    const result = await window.api.testLLMConnection(settings);
    this.btnSave.textContent = '保存设置';
    this.btnSave.classList.remove('loading');

    if (result.success) {
      this.saveSuccess.classList.add('show');
      setTimeout(() => window.close(), 800);
    } else {
      errorEl.textContent = `⚠️ 大模型测试连接失败，请核对后重试 (${result.error})`;
      errorEl.classList.add('show');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SettingsPage();
});
