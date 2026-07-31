// WebSocket 连接
const socket = io();

// 当前平台
let currentPlatform = 'config';

// 各平台导入的链接（分类后回填用）
const importedUrls = { zhihu: [], toutiao: [], csdn: [], sohu: [], baidu: [], unknown: [] };

// 平台中文名（导入结果展示用）
const PLATFORM_LABELS = {
  zhihu: '知乎',
  toutiao: '今日头条',
  csdn: 'CSDN',
  sohu: '搜狐',
  baidu: '百度',
  unknown: '未识别'
};

// 平台配置模板
const templates = {
  config: () => `
    <div class="config-card">
      <div class="config-card-title">接口类型</div>
      <div class="form-group">
        <label>选择接口协议</label>
        <select id="api-type">
          <option value="chat">OpenAI 格式 (/v1/chat/completions)</option>
          <option value="responses">Responses 格式 (/responses)</option>
          <option value="messages">Claude 格式 (/v1/messages)</option>
        </select>
      </div>
    </div>

    <div class="config-card">
      <div class="config-card-title">接口地址</div>
      <div class="form-group">
        <label>API Endpoint</label>
        <input type="text" id="api-endpoint" placeholder="https://api.example.com/v1/messages">
        <div class="hint-text">完整的 API 接口地址，包含协议和路径</div>
      </div>
    </div>

    <div class="config-card">
      <div class="config-card-title">认证信息</div>
      <div class="form-row">
        <div class="form-group">
          <label>API Key</label>
          <div class="input-with-icon">
            <input type="password" id="api-key" placeholder="sk-xxxxxxxxxxxx">
            <button class="toggle-password" onclick="togglePassword('api-key')">👁️</button>
          </div>
          <div class="hint-text">接口密钥，点击眼睛图标可显示/隐藏</div>
        </div>
        <div class="form-group">
          <label>模型名称</label>
          <input type="text" id="model-name" placeholder="claude-opus-4-8">
          <div class="hint-text">使用的 AI 模型标识符</div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>最大输出 Token</label>
          <input type="number" id="max-tokens" value="1024" min="128" max="16384" step="256">
          <div class="hint-text">每条评论生成的最大 token 数（默认 1024）。DeepSeek 等推理模型的思考会占去大量预算，若评论生成失败可调大</div>
        </div>
      </div>
    </div>

    <div class="config-card">
      <div class="btn-group">
        <button class="btn btn-primary" onclick="testConnection()">测试连接</button>
        <button class="btn btn-success" onclick="saveConfig()">保存配置</button>
      </div>
    </div>
  `,

  import: () => `
    <div class="config-card">
      <div class="config-card-title">粘贴链接</div>
      <div class="form-group">
        <label>文章链接（每行一个，或随意粘贴）</label>
        <textarea id="import-textarea" placeholder="从 Excel 复制一列链接粘贴到这里&#10;系统会自动识别其中的 http 链接"></textarea>
        <div class="hint-text">支持知乎、头条、CSDN、搜狐、百度百家号链接</div>
      </div>
    </div>

    <div class="config-card">
      <div class="config-card-title">上传 Excel 文件</div>
      <div class="form-group">
        <label>选择 .xlsx / .xls / .csv 文件</label>
        <div class="file-input-wrapper">
          <span class="file-input-btn">📄 点击选择文件</span>
          <input type="file" id="import-file" accept=".xlsx,.xls,.csv" onchange="handleFileUpload(event)">
        </div>
        <div class="file-name" id="file-name-display"></div>
        <div class="hint-text">自动读取所有工作表的单元格内容，提取其中的链接</div>
      </div>
    </div>

    <div class="config-card">
      <div class="btn-group">
        <button class="btn btn-primary" onclick="classifyAndFill()">分类并回填</button>
        <button class="btn btn-danger" onclick="clearImported()">清空</button>
      </div>
    </div>

    <div class="config-card" id="import-result-card" style="display:none;">
      <div class="config-card-title">分类结果</div>
      <div id="import-result-content"></div>
    </div>
  `,

  all: () => `
    <div class="config-card">
      <div class="config-card-title">各平台文章链接</div>
      <div class="hint-text">为每个平台填入文章链接（每行一个）；也可先去「批量导入」自动分类回填到这里。一键运行会按 知乎→头条→CSDN→搜狐→百度 顺序串行评论，全部评论完后再统一检测。</div>
      ${['zhihu', 'toutiao', 'csdn', 'sohu', 'baidu'].map((p) => `
        <div class="form-group" style="margin-top:14px;">
          <label>${PLATFORM_LABELS[p]}</label>
          <textarea id="all-urls-${p}" placeholder="${PLATFORM_LABELS[p]} 文章链接，每行一个...">${(importedUrls[p] || []).join('\n')}</textarea>
        </div>
      `).join('')}
    </div>

    <div class="config-card">
      <div class="config-card-title">运行设置</div>
      <div class="form-row">
        <div class="form-group">
          <label>每篇文章评论数</label>
          <input type="number" id="all-comment-count" value="2" min="1" max="10">
        </div>
        <div class="form-group">
          <label>评论后自动检测</label>
          <label class="checkbox-row"><input type="checkbox" id="all-enable-detect" checked> 全部评论完成后，回查评论数 / 点赞 / 收藏（搜狐暂不检测）</label>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-success" id="all-start-btn" onclick="startAll()">🚀 开始全部（串行）</button>
        <button class="btn" id="all-pause-btn" style="background:linear-gradient(135deg,#f6d365,#fda085);color:#fff;" onclick="pauseRun()" disabled>⏸ 暂停</button>
        <button class="btn btn-primary" id="all-resume-btn" onclick="resumeRun()" disabled>▶ 继续</button>
        <button class="btn btn-danger" id="all-stop-btn" onclick="stopAll()" disabled>停止</button>
      </div>
    </div>

    <div class="config-card">
      <div class="config-card-title">运行进度</div>
      <div id="all-progress" class="all-progress">尚未开始</div>
    </div>

    <div class="config-card">
      <div class="config-card-title">运行日志（全部平台）</div>
      <div class="log-container" id="log-container">
        <div class="log-entry log-info">[系统] 等待启动...</div>
      </div>
    </div>

    <div class="config-card">
      <div class="hint-text">评论全部完成后会自动进入检测阶段；检测结果请到左侧「🔍 检测中心」查看。</div>
    </div>
  `,

  detect: () => `
    <div class="config-card">
      <div class="config-card-title">粘贴文章链接</div>
      <div class="hint-text">粘贴要检测的文章链接（每行一个，或随意粘贴），自动识别 知乎 / 头条 / CSDN / 百度 并分类。检测会回查「我的评论数 + 点赞 + 收藏」。搜狐暂不支持检测。</div>
      <textarea id="detect-textarea" placeholder="每行一个文章链接，例如：&#10;https://zhuanlan.zhihu.com/p/xxx&#10;https://blog.csdn.net/xxx/article/details/xxx" oninput="updateDetectClassify()"></textarea>
      <div id="detect-classify" class="classify-tags"></div>
    </div>

    <div class="config-card">
      <div class="btn-group">
        <button class="btn btn-primary" id="detect-start-btn" onclick="startDetect()">🔍 一键检测</button>
        <button class="btn btn-danger" id="detect-stop-btn" onclick="stopDetect()" disabled>停止</button>
        <button class="btn" style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;" onclick="openAccountModal()">👤 检测账号</button>
        <button class="btn btn-success" onclick="exportDetectCsv()">导出 CSV</button>
        <button class="btn" style="background:#475569;color:#fff;" onclick="clearDetect()">清空结果</button>
      </div>
    </div>

    <div class="config-card">
      <div class="config-card-title">检测进度</div>
      <div id="detect-progress" class="all-progress">尚未开始</div>
    </div>

    <div class="config-card">
      <div class="config-card-title">检测结果</div>
      <div id="detect-results"></div>
    </div>

    <div class="config-card">
      <div class="config-card-title">达标操作</div>
      <div class="hint-text">达标线：评论≥3 且 已点赞 且 已收藏。不达标的文章可一键「补跑」（再跑一遍评论+点赞+收藏，评论按缺口补到 3），补跑后再点「重测」刷新结果。每篇最多补跑 2 次，到上限交人工。</div>
      <div class="btn-group">
        <button class="btn btn-primary" id="fix-btn" onclick="startFix()" disabled>🛠 补跑不达标项</button>
        <button class="btn btn-success" id="refail-btn" onclick="redetectFailed()" disabled>🔄 重测未达标项</button>
      </div>
    </div>

    <div class="config-card">
      <div class="config-card-title">检测日志</div>
      <div class="log-container" id="log-container">
        <div class="log-entry log-info">[系统] 等待启动...</div>
      </div>
    </div>
  `,

  platform: (platform, defaultUrls, userDataDir) => `
    <div class="config-card">
      <div class="config-card-title">文章配置</div>
      <div class="form-group">
        <label>文章链接（每行一个）</label>
        <textarea id="article-urls" placeholder="每行一个链接...">${defaultUrls}</textarea>
        <div class="hint-text">支持多个链接，每行一个</div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>每篇文章评论数</label>
          <input type="number" id="comment-count" value="2" min="1" max="10">
        </div>
        <div class="form-group">
          <label>用户数据目录</label>
          <input type="text" value="${userDataDir}" readonly>
        </div>
      </div>
    </div>

    <div class="config-card">
      <div class="btn-group">
        <button class="btn btn-success" id="start-btn" onclick="startTask('${platform}')">开始评论</button>
        <button class="btn" id="pause-btn" style="background:linear-gradient(135deg,#f6d365,#fda085);color:#fff;" onclick="pauseRun()" disabled>⏸ 暂停</button>
        <button class="btn btn-primary" id="resume-btn" onclick="resumeRun()" disabled>▶ 继续</button>
        <button class="btn btn-danger" id="stop-btn" onclick="stopTask('${platform}')" disabled>停止</button>
      </div>
    </div>

    <div class="config-card">
      <div class="config-card-title">运行日志</div>
      <div class="log-container" id="log-container">
        <div class="log-entry log-info">[系统] 等待启动...</div>
      </div>
    </div>
  `
};

// 平台默认配置
const platformDefaults = {
  zhihu: {
    urls: '',
    userDataDir: 'D:\\playwright\\pw-data-zhihu'
  },
  toutiao: {
    urls: '',
    userDataDir: 'D:\\playwright\\pw-data-toutiao'
  },
  csdn: {
    urls: '',
    userDataDir: 'D:\\playwright\\pw-data-csdn'
  },
  sohu: {
    urls: '',
    userDataDir: 'D:\\playwright\\pw-data-sohu'
  },
  baidu: {
    urls: '',
    userDataDir: 'D:\\playwright\\pw-data-baidu'
  }
};

// 平台标题映射
const platformTitles = {
  config: 'AI 接口配置',
  import: '批量导入链接',
  all: '一键运行',
  detect: '检测中心',
  zhihu: '知乎 - 自动评论',
  toutiao: '今日头条 - 自动评论',
  csdn: 'CSDN - 自动评论',
  sohu: '搜狐 - 自动评论',
  baidu: '百度 - 自动评论'
};

// 切换平台
document.querySelectorAll('.platform-item').forEach(item => {
  item.addEventListener('click', function() {
    const platform = this.dataset.platform;
    // 离开「一键运行」页前，把已编辑的各平台链接回填到 importedUrls，避免切回时丢失
    if (currentPlatform === 'all' && platform !== 'all') saveAllUrls();
    currentPlatform = platform;

    // 更新选中状态
    document.querySelectorAll('.platform-item').forEach(i => i.classList.remove('active'));
    this.classList.add('active');

    // 更新页面标题
    document.getElementById('page-title').textContent = platformTitles[platform];

    // 渲染内容
    renderContent(platform);
  });
});

// 渲染内容
function renderContent(platform) {
  const content = document.getElementById('main-content');

  if (platform === 'config') {
    content.innerHTML = templates.config();
    loadConfig();
  } else if (platform === 'import') {
    content.innerHTML = templates.import();
    if (Object.keys(importedUrls).some(k => (importedUrls[k] || []).length > 0)) {
      renderImportResult();
    }
  } else if (platform === 'all') {
    content.innerHTML = templates.all();
  } else if (platform === 'detect') {
    content.innerHTML = templates.detect();
    updateDetectClassify();
    renderDetectionTable();
  } else {
    const defaults = platformDefaults[platform];
    const urls = (importedUrls[platform] && importedUrls[platform].length)
      ? importedUrls[platform].join('\n')
      : defaults.urls;
    content.innerHTML = templates.platform(platform, urls, defaults.userDataDir);
  }
}

// 加载 AI 配置
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();

    if (data.success) {
      document.getElementById('api-type').value = data.config.apiType;
      document.getElementById('api-endpoint').value = data.config.endpoint;
      document.getElementById('api-key').value = data.config.apiKey;
      document.getElementById('model-name').value = data.config.model;
      document.getElementById('max-tokens').value = data.config.maxTokens || 1024;
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

// 保存配置
async function saveConfig() {
  const config = {
    apiType: document.getElementById('api-type').value,
    endpoint: document.getElementById('api-endpoint').value,
    apiKey: document.getElementById('api-key').value,
    model: document.getElementById('model-name').value,
    maxTokens: parseInt(document.getElementById('max-tokens').value, 10) || 1024
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await res.json();

    if (data.success) {
      addLog('success', '[系统] ' + data.message);
    } else {
      addLog('error', '[错误] ' + data.error);
    }
  } catch (error) {
    addLog('error', '[错误] 保存失败: ' + error.message);
  }
}

// 测试连接
async function testConnection() {
  addLog('info', '[系统] 正在测试 AI 接口连接...');

  try {
    const res = await fetch('/api/test-connection', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      addLog('success', '[系统] ' + data.message);
    } else {
      addLog('error', '[错误] ' + data.error);
    }
  } catch (error) {
    addLog('error', '[错误] 测试失败: ' + error.message);
  }
}

// 启动任务
async function startTask(platform) {
  const urls = document.getElementById('article-urls').value.trim().split('\n').filter(u => u);
  const commentCount = parseInt(document.getElementById('comment-count').value);

  if (urls.length === 0) {
    alert('请输入至少一个文章链接');
    return;
  }

  // 清空日志
  document.getElementById('log-container').innerHTML = '';

  try {
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, urls, commentCount })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('start-btn').disabled = true;
      document.getElementById('stop-btn').disabled = false;
      updateStatus('running', '运行中');
      addLog('success', '[系统] ' + data.message);
    } else {
      addLog('error', '[错误] ' + data.error);
    }
  } catch (error) {
    addLog('error', '[错误] 启动失败: ' + error.message);
  }
}

// 停止任务
async function stopTask(platform) {
  try {
    const res = await fetch('/api/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('start-btn').disabled = false;
      document.getElementById('stop-btn').disabled = true;
      updateStatus('idle', '已停止');
      addLog('info', '[系统] ' + data.message);
    } else {
      addLog('error', '[错误] ' + data.error);
    }
  } catch (error) {
    addLog('error', '[错误] 停止失败: ' + error.message);
  }
}

// 切换密码显示
function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  const button = event.target;
  if (input.type === 'password') {
    input.type = 'text';
    button.textContent = '🙈';
  } else {
    input.type = 'password';
    button.textContent = '👁️';
  }
}

// 添加日志
function addLog(type, message) {
  const logContainer = document.getElementById('log-container');
  if (!logContainer) return;

  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.textContent = `[${timestamp}] ${message}`;

  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 更新状态
function updateStatus(status, text) {
  const indicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');

  indicator.className = 'status-indicator status-' + status;
  statusText.textContent = text;
}

// 按运行状态切换 开始/暂停/继续/停止 按钮的可用性
// prefix='' 单平台页，prefix='all-' 一键运行页
function setRunButtons(prefix, state) {
  const start = document.getElementById(prefix + 'start-btn');
  const pause = document.getElementById(prefix + 'pause-btn');
  const resume = document.getElementById(prefix + 'resume-btn');
  const stop = document.getElementById(prefix + 'stop-btn');
  if (start) start.disabled = (state === 'running' || state === 'paused');
  if (pause) pause.disabled = (state !== 'running');
  if (resume) resume.disabled = (state !== 'paused');
  if (stop) stop.disabled = (state === 'idle');
}

// 暂停/继续当前评论任务（通过 ipc，不重启、从当前位置继续）
async function pauseRun() {
  try {
    const r = await fetch('/api/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: currentPlatform }) });
    const d = await r.json();
    if (!d.success) addLog('error', '[错误] ' + d.error);
  } catch (e) { addLog('error', '[错误] 暂停失败: ' + e.message); }
}
async function resumeRun() {
  try {
    const r = await fetch('/api/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: currentPlatform }) });
    const d = await r.json();
    if (!d.success) addLog('error', '[错误] ' + d.error);
  } catch (e) { addLog('error', '[错误] 继续失败: ' + e.message); }
}

// ===== 检测账号设置弹窗 =====
async function openAccountModal() {
  try {
    const r = await fetch('/api/detect-accounts');
    const d = await r.json();
    const a = (d.success && d.accounts) || {};
    document.getElementById('acc-csdn').value = a.csdn || '';
    document.getElementById('acc-zhihu').value = a.zhihu || '';
    document.getElementById('acc-toutiao').value = a.toutiao || '';
    document.getElementById('acc-baidu').value = a.baidu || '';
  } catch (e) { /* 首次无配置忽略 */ }
  document.getElementById('account-modal').style.display = 'flex';
}
function closeAccountModal() {
  document.getElementById('account-modal').style.display = 'none';
}
async function saveAccounts() {
  const accounts = {
    csdn: document.getElementById('acc-csdn').value.trim(),
    zhihu: document.getElementById('acc-zhihu').value.trim(),
    toutiao: document.getElementById('acc-toutiao').value.trim(),
    baidu: document.getElementById('acc-baidu').value.trim()
  };
  try {
    const r = await fetch('/api/detect-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accounts: accounts }) });
    const d = await r.json();
    if (d.success) { addLog('success', '[系统] ' + d.message); closeAccountModal(); }
    else addLog('error', '[错误] ' + d.error);
  } catch (e) { addLog('error', '[错误] 保存失败: ' + e.message); }
}

// WebSocket 事件监听
socket.on('log', (data) => {
  // 一键运行 / 检测中心：展示所有平台日志，并加平台前缀
  if (currentPlatform === 'all' || currentPlatform === 'detect') {
    const tag = (data.platform === 'all' || data.platform === 'detect') ? '' : ('[' + (PLATFORM_LABELS[data.platform] || data.platform) + '] ');
    addLog(data.type, tag + data.log.trim());
  } else if (data.platform === currentPlatform) {
    addLog(data.type, data.log.trim());
  }
});

// 一键运行：进度更新
socket.on('all-progress', (data) => {
  if (currentPlatform !== 'all') return;
  const el = document.getElementById('all-progress');
  if (!el) return;
  const phaseLabel = data.phase === 'comment' ? '评论' : '检测';
  const platLabel = PLATFORM_LABELS[data.platform] || data.platform;
  if (data.status === 'running') {
    el.innerHTML = '<span class="prog-running">▶</span> ' + phaseLabel + '阶段 (' + data.index + '/' + data.total + ')：' + platLabel + ' …';
  } else {
    el.innerHTML = '<span class="prog-done">✓</span> ' + phaseLabel + '阶段 (' + data.index + '/' + data.total + ')：' + platLabel + ' 完成';
  }
});

// 检测结果（整平台，来自一键运行检测阶段 或 检测中心一键检测；merge 时按 url 合并保留旧行）
socket.on('detection', (data) => {
  const results = data.results || [];
  if (data.merge) {
    if (!detectionData[data.platform]) detectionData[data.platform] = [];
    const list = detectionData[data.platform];
    results.forEach(function (r) {
      const i = list.findIndex(function (x) { return x.url === r.url; });
      if (i >= 0) list[i] = r; else list.push(r);
    });
  } else {
    detectionData[data.platform] = results;
  }
  if (currentPlatform === 'detect') renderDetectionTable();
});

// 单链接重新检测结果
socket.on('detection-row', (data) => {
  const result = data.result;
  if (!result) return;
  if (!detectionData[data.platform]) detectionData[data.platform] = [];
  const list = detectionData[data.platform];
  const i = list.findIndex((r) => r.url === result.url);
  if (i >= 0) list[i] = result; else list.push(result);
  delete redetectingUrls[result.url];
  if (currentPlatform === 'detect') renderDetectionTable();
});

// 检测中心：一键检测/重测 进度
socket.on('detect-progress', (data) => {
  if (currentPlatform !== 'detect') return;
  const el = document.getElementById('detect-progress');
  if (!el) return;
  const platLabel = PLATFORM_LABELS[data.platform] || data.platform;
  if (data.status === 'running') {
    el.innerHTML = '<span class="prog-running">▶</span> 正在检测 (' + data.index + '/' + data.total + ')：' + platLabel + ' …';
  } else {
    el.innerHTML = '<span class="prog-done">✓</span> 检测完成 (' + data.index + '/' + data.total + ')：' + platLabel;
  }
});

// 检测中心：补跑进度
socket.on('fix-progress', (data) => {
  if (currentPlatform !== 'detect') return;
  const el = document.getElementById('detect-progress');
  if (!el) return;
  const platLabel = PLATFORM_LABELS[data.platform] || data.platform;
  if (data.status === 'running') {
    el.innerHTML = '<span class="prog-running">▶</span> 补跑 (' + data.index + '/' + data.total + ')：' + platLabel + '（补发 ' + data.count + ' 条评论）…';
  } else {
    el.innerHTML = '<span class="prog-done">✓</span> 补跑 (' + data.index + '/' + data.total + ')：' + platLabel + ' 完成';
  }
});

// 检测中心：一键检测/重测 完成
socket.on('detect-done', () => {
  if (currentPlatform === 'detect') {
    const el = document.getElementById('detect-progress');
    if (el) el.innerHTML = '<span class="prog-done">✓</span> 检测完成';
  }
  setDetectBusy(false);
});

// 检测中心：补跑完成
socket.on('fix-done', () => {
  if (currentPlatform === 'detect') {
    const el = document.getElementById('detect-progress');
    if (el) el.innerHTML = '<span class="prog-done">✓</span> 补跑完成，可点「重测未达标项」刷新结果';
    addLog('success', '[系统] 补跑完成。建议点「重测未达标项」刷新结果，看哪些已达标。');
  }
  setDetectBusy(false);
});

// 一键运行：全部完成
socket.on('all-done', () => {
  if (currentPlatform !== 'all') return;
  const el = document.getElementById('all-progress');
  if (el) el.innerHTML = '<span class="prog-done">✓</span> 全部运行完成';
  resetAllButtons();
  updateStatus('idle', '就绪');
});

socket.on('status', (data) => {
  if (data.platform !== currentPlatform) return;
  const statusMap = {
    idle: '就绪',
    running: '运行中',
    paused: '已暂停',
    error: '错误'
  };
  updateStatus(data.status, statusMap[data.status] || '未知');
  // 按 状态 切换 开始/暂停/继续/停止 按钮
  if (currentPlatform === 'all') setRunButtons('all-', data.status);
  else if (['zhihu', 'toutiao', 'csdn', 'sohu', 'baidu'].indexOf(currentPlatform) >= 0) setRunButtons('', data.status);
});

// ===== 一键运行相关 =====

// 各平台检测结果缓存（platform -> results[]），用于切回页面时重渲染表格
let detectionData = {};
// 正在重新检测的链接（url -> true），用于表格里显示「检测中…」
let redetectingUrls = {};
// 达标线（写死，与一键运行的评论数无关）：评论≥3 且 已点赞 且 已收藏
const COMPLIANCE_MIN = 3;
// 每篇文章「补跑」最多次数，到上限交人工
const MAX_FIX_RETRY = 2;
// 每篇文章已补跑次数（url -> n），独立于 detectionData，避免重测时被清掉
let retryCounts = {};
// 检测中心是否有操作在跑（一键检测/补跑/重测）→ 控制按钮可用性
let detectBusy = false;

// 判定单篇文章达标状态：pass / fail / unknown / invalid（404已失效，不参与补跑补测）
function rowStatus(r) {
  if (r.invalid) return { status: 'invalid', missing: ['链接已失效（404/被删）'] };
  const cc = r.commentCount;
  if (cc === null || cc === undefined) return { status: 'unknown', missing: ['评论数未知'] };
  const missing = [];
  if (cc < COMPLIANCE_MIN) missing.push('缺' + (COMPLIANCE_MIN - cc) + '评论');
  if (r.liked === false) missing.push('缺赞');
  else if (r.liked !== true) missing.push('点赞未知');
  if (r.collected === false) missing.push('缺收藏');
  else if (r.collected !== true) missing.push('收藏未知');
  if (missing.length === 0) return { status: 'pass', missing: [] };
  const hasConcreteFail = cc < COMPLIANCE_MIN || r.liked === false || r.collected === false;
  return { status: hasConcreteFail ? 'fail' : 'unknown', missing };
}

// 把「一键运行」页里各平台 textarea 的内容回填到 importedUrls（切走时不丢失输入）
function saveAllUrls() {
  ['zhihu', 'toutiao', 'csdn', 'sohu', 'baidu'].forEach(function (p) {
    const ta = document.getElementById('all-urls-' + p);
    if (ta) {
      importedUrls[p] = ta.value.trim().split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    }
  });
}

// 开始一键运行（串行：评论全部 → 检测全部）
async function startAll() {
  saveAllUrls();
  const tasks = [];
  ['zhihu', 'toutiao', 'csdn', 'sohu', 'baidu'].forEach(function (p) {
    if ((importedUrls[p] || []).length > 0) tasks.push({ platform: p, urls: importedUrls[p].slice() });
  });
  if (tasks.length === 0) { alert('请至少为一个平台填入文章链接'); return; }

  const commentCount = parseInt(document.getElementById('all-comment-count').value) || 2;
  const enableDetection = document.getElementById('all-enable-detect').checked;

  // 重置界面
  const logBox = document.getElementById('log-container');
  if (logBox) logBox.innerHTML = '';
  const res = document.getElementById('detect-results');
  if (res) res.innerHTML = '';
  const prog = document.getElementById('all-progress');
  if (prog) prog.textContent = '准备启动…';
  detectionData = {};

  document.getElementById('all-start-btn').disabled = true;
  document.getElementById('all-stop-btn').disabled = false;
  updateStatus('running', '运行中');

  try {
    const r = await fetch('/api/start-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: tasks, commentCount: commentCount, enableDetection: enableDetection })
    });
    const data = await r.json();
    if (data.success) {
      addLog('success', '[系统] ' + data.message);
    } else {
      addLog('error', '[错误] ' + data.error);
      resetAllButtons();
      updateStatus('idle', '就绪');
    }
  } catch (e) {
    addLog('error', '[错误] 启动失败: ' + e.message);
    resetAllButtons();
    updateStatus('idle', '就绪');
  }
}

// 停止一键运行
async function stopAll() {
  try {
    const r = await fetch('/api/stop-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const data = await r.json();
    if (data.success) addLog('info', '[系统] ' + data.message);
    else addLog('error', '[错误] ' + data.error);
  } catch (e) {
    addLog('error', '[错误] 停止失败: ' + e.message);
  }
}

function resetAllButtons() {
  const s = document.getElementById('all-start-btn');
  const t = document.getElementById('all-stop-btn');
  if (s) s.disabled = false;
  if (t) t.disabled = true;
}

// 渲染检测结果表（汇总所有已返回的平台）+ 达标汇总 + 按钮 state
function renderDetectionTable() {
  const root = document.getElementById('detect-results');
  if (!root) return;
  const platforms = ['zhihu', 'toutiao', 'csdn', 'baidu'];
  let rows = '';
  let total = 0, passN = 0, failN = 0, unknownN = 0, invalidN = 0, fixableN = 0, refailN = 0;
  let any = false;

  platforms.forEach(function (p) {
    const list = detectionData[p];
    if (!list || list.length === 0) return;
    any = true;
    list.forEach(function (r) {
      any = true;
      total++;
      const st = rowStatus(r);
      if (st.status === 'pass') passN++;
      else if (st.status === 'fail') failN++;
      else if (st.status === 'invalid') invalidN++;
      else unknownN++;
      const retries = retryCounts[r.url] || 0;
      if (st.status === 'fail' && retries < MAX_FIX_RETRY) fixableN++;
      // 重测只针对 fail/unknown，已失效(pass/invalid)不参与
      if (st.status === 'fail' || st.status === 'unknown') refailN++;

      const cmt = (r.commentCount === null || r.commentCount === undefined) ? '<span class="detect-unk">未知</span>' : (r.commentCount + ' 条');
      const plat = PLATFORM_LABELS[p] || p;
      const err = r.error ? '<div class="detect-err">' + escapeHtml(r.error) + '</div>' : '';

      // 文章列：可点击 URL（系统浏览器打开），CSS 截断 + 悬停看全
      const url = r.url || '';
      const link = url
        ? '<a class="detect-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener" title="' + escapeHtml(url) + '">' + escapeHtml(url) + '</a>'
        : '<span class="detect-unk">无</span>';

      // 达标列
      let badge;
      if (st.status === 'invalid') {
        badge = '<span class="badge badge-invalid">⚠ 已失效</span><div class="detect-missing">404/被删，已排除补跑补测</div>';
      } else if (st.status === 'pass') {
        badge = '<span class="badge badge-pass">达标</span>';
      } else if (st.status === 'fail') {
        const cap = retries >= MAX_FIX_RETRY ? ' <span class="badge badge-cap">已达上限·人工</span>' : '';
        badge = '<span class="badge badge-fail">不达标</span>' + cap + '<div class="detect-missing">' + st.missing.join(' · ') + '</div>';
      } else {
        badge = '<span class="badge badge-unknown">待核对</span><div class="detect-missing">' + st.missing.join(' · ') + '</div>';
      }

      // 操作列（已失效的文章也能手动重新检测，确认是否真的没了）
      let action;
      if (redetectingUrls[r.url]) {
        action = '<span class="detect-unk">检测中…</span>';
      } else {
        action = "<button class=\"btn-mini\" onclick='redetect(" + JSON.stringify(p) + ", " + JSON.stringify(r.url) + ")'>重新检测</button>";
      }

      const rowCls = st.status === 'invalid' ? ' class="row-invalid"'
        : st.status === 'fail' ? ' class="row-fail"'
        : st.status === 'unknown' ? ' class="row-unknown"' : '';
      rows += '<tr' + rowCls + '><td>' + plat + '</td>'
        + '<td class="detect-url">' + link + err + '</td>'
        + '<td>' + cmt + '</td>'
        + '<td>' + fmtFlag(r.liked) + '</td>'
        + '<td>' + fmtFlag(r.collected) + '</td>'
        + '<td class="detect-status">' + badge + '</td>'
        + '<td>' + action + '</td></tr>';
    });
  });

  // 更新达标操作按钮（即使没在检测页也安全：元素不存在就跳过）
  const fixBtn = document.getElementById('fix-btn');
  const refailBtn = document.getElementById('refail-btn');
  if (fixBtn) {
    fixBtn.textContent = '🛠 补跑不达标项' + (fixableN ? ' (' + fixableN + ')' : '');
    fixBtn.disabled = detectBusy || fixableN === 0;
  }
  if (refailBtn) {
    refailBtn.textContent = '🔄 重测未达标项' + (refailN ? ' (' + refailN + ')' : '');
    refailBtn.disabled = detectBusy || refailN === 0;
  }

  if (!any) {
    root.innerHTML = '<div class="hint-text">暂无检测结果。粘贴链接后点「一键检测」，或在一键运行完成后查看自动检测结果。</div>'
      + (document.getElementById('fix-btn') ? '<div class="detect-summary"></div>' : '');
    return;
  }

  const summary = '<div class="detect-summary">共 ' + total + ' 篇 · '
    + '<span class="badge-pass">达标 ' + passN + '</span> · '
    + '<span class="badge-fail">不达标 ' + failN + '</span> · '
    + '<span class="badge-unknown">待核对 ' + unknownN + '</span>'
    + (invalidN ? ' · <span class="badge-invalid">已失效 ' + invalidN + '</span>' : '')
    + '<span class="detect-rule">达标线：评论≥' + COMPLIANCE_MIN + ' 且 已点赞 且 已收藏</span></div>';

  root.innerHTML = summary + '<table class="detect-table"><thead><tr><th>平台</th><th>文章链接</th><th>我的评论</th><th>点赞</th><th>收藏</th><th>达标</th><th>操作</th></tr></thead><tbody>'
    + rows + '</tbody></table>';
}

function fmtFlag(v) {
  if (v === null || v === undefined) return '<span class="detect-unk">未知</span>';
  return v ? '<span class="detect-ok">✅</span>' : '<span class="detect-no">❌</span>';
}

function shortUrl(u) {
  try { const x = new URL(u); return x.hostname + x.pathname; } catch (e) { return u || ''; }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ===== 检测中心相关 =====

// 实时分类粘贴的链接（有效 / 各平台数 / 去重 / 无效）
function updateDetectClassify() {
  const ta = document.getElementById('detect-textarea');
  const box = document.getElementById('detect-classify');
  if (!ta || !box) return;
  const urls = extractUrls(ta.value);
  const counts = { zhihu: 0, toutiao: 0, csdn: 0, sohu: 0, baidu: 0, unknown: 0 };
  const seen = {};
  let dup = 0, valid = 0;
  urls.forEach(function (u) {
    const p = classifyUrl(u);
    if (p === 'unknown') { counts.unknown++; return; }
    if (seen[u]) { dup++; return; }
    seen[u] = 1; counts[p]++; valid++;
  });
  let html = '<span class="ctag ctag-ok">有效 ' + valid + '</span>';
  ['zhihu', 'toutiao', 'csdn', 'baidu'].forEach(function (p) {
    if (counts[p]) html += '<span class="ctag">' + PLATFORM_LABELS[p] + ' ' + counts[p] + '</span>';
  });
  if (counts.sohu) html += '<span class="ctag ctag-warn">搜狐 ' + counts.sohu + '（暂不检测）</span>';
  if (dup) html += '<span class="ctag ctag-warn">已去重 ' + dup + '</span>';
  if (counts.unknown) html += '<span class="ctag ctag-err">无效 ' + counts.unknown + '</span>';
  box.innerHTML = html;
}

// 把粘贴的链接按平台分组（排除 sohu / unknown / 重复）
function groupDetectUrls() {
  const ta = document.getElementById('detect-textarea');
  if (!ta) return [];
  const urls = extractUrls(ta.value);
  const groups = {};
  const seen = {};
  urls.forEach(function (u) {
    const p = classifyUrl(u);
    if (p === 'unknown' || p === 'sohu' || seen[u]) return;
    seen[u] = 1;
    if (!groups[p]) groups[p] = [];
    groups[p].push(u);
  });
  return Object.keys(groups).map(function (p) { return { platform: p, urls: groups[p] }; });
}

// 一键检测
// 一键检测
async function startDetect() {
  const tasks = groupDetectUrls();
  if (tasks.length === 0) { alert('没有可检测的有效链接（仅支持知乎 / 头条 / CSDN / 百度）'); return; }

  const logBox = document.getElementById('log-container');
  if (logBox) logBox.innerHTML = '';
  const prog = document.getElementById('detect-progress');
  if (prog) prog.textContent = '准备启动…';
  detectionData = {};
  redetectingUrls = {};
  retryCounts = {};
  renderDetectionTable();
  updateStatus('running', '检测中');

  try {
    const r = await fetch('/api/detect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: tasks })
    });
    const data = await r.json();
    if (data.success) { addLog('success', '[系统] ' + data.message); setDetectBusy(true); }
    else { addLog('error', '[错误] ' + data.error); updateStatus('idle', '就绪'); }
  } catch (e) {
    addLog('error', '[错误] 启动失败: ' + e.message);
    updateStatus('idle', '就绪');
  }
}

// 停止（一键检测 / 补跑 一起发停止，服务端各自按需 no-op）
async function stopDetect() {
  try {
    await fetch('/api/fix-stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const r = await fetch('/api/detect-stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json();
    if (data.success) addLog('info', '[系统] ' + data.message);
  } catch (e) { addLog('error', '[错误] 停止失败: ' + e.message); }
}

// 检测中心操作在跑/结束 → 切换按钮
function setDetectBusy(busy) {
  detectBusy = busy;
  const start = document.getElementById('detect-start-btn');
  const stop = document.getElementById('detect-stop-btn');
  if (start) start.disabled = busy;
  if (stop) stop.disabled = !busy;
  renderDetectionTable(); // fix/refail 按 detectBusy + 计数重算
  if (!busy) updateStatus('idle', '就绪');
}

// 补跑不达标项：把"不达标且重试<2"的文章按 (平台, 缺口) 分组发给 /api/fix
async function startFix() {
  if (detectBusy) return;
  const groups = {}; // key = platform|deficit
  const sentUrls = [];
  ['zhihu', 'toutiao', 'csdn', 'baidu'].forEach(function (p) {
    (detectionData[p] || []).forEach(function (r) {
      if (rowStatus(r).status !== 'fail') return;
      if ((retryCounts[r.url] || 0) >= MAX_FIX_RETRY) return;
      const cc = (r.commentCount === null || r.commentCount === undefined) ? COMPLIANCE_MIN : r.commentCount;
      const deficit = Math.max(0, COMPLIANCE_MIN - cc);
      const key = p + '|' + deficit;
      if (!groups[key]) groups[key] = { platform: p, count: deficit, urls: [] };
      groups[key].urls.push(r.url);
      sentUrls.push(r.url);
    });
  });
  if (sentUrls.length === 0) { alert('没有可补跑的不达标文章（可能都已达到重试上限，请人工处理）'); return; }
  const tasks = Object.keys(groups).map(function (k) { return groups[k]; });

  // 立即计入重试次数（避免补跑期间重复提交）
  sentUrls.forEach(function (u) { retryCounts[u] = (retryCounts[u] || 0) + 1; });
  addLog('info', '[系统] 补跑 ' + sentUrls.length + ' 篇不达标文章（' + tasks.length + ' 个任务）');
  setDetectBusy(true);
  updateStatus('running', '补跑中');

  try {
    const r = await fetch('/api/fix', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: tasks })
    });
    const data = await r.json();
    if (!data.success) {
      sentUrls.forEach(function (u) { retryCounts[u] = Math.max(0, (retryCounts[u] || 0) - 1); }); // 回退
      addLog('error', '[错误] ' + data.error);
      setDetectBusy(false);
    }
  } catch (e) {
    sentUrls.forEach(function (u) { retryCounts[u] = Math.max(0, (retryCounts[u] || 0) - 1); });
    addLog('error', '[错误] 补跑启动失败: ' + e.message);
    setDetectBusy(false);
  }
}

// 重测未达标项：重新检测所有"非达标"行（fail + unknown），merge 保留已达标行
async function redetectFailed() {
  if (detectBusy) return;
  const groups = {};
  ['zhihu', 'toutiao', 'csdn', 'baidu'].forEach(function (p) {
    (detectionData[p] || []).forEach(function (r) {
      const st = rowStatus(r).status;
      if (st === 'pass' || st === 'invalid') return; // 达标 / 已失效 都不重测
      if (!groups[p]) groups[p] = { platform: p, urls: [] };
      groups[p].urls.push(r.url);
    });
  });
  const tasks = Object.keys(groups).map(function (k) { return groups[k]; });
  if (tasks.length === 0) { alert('没有需要重测的未达标文章（已失效的文章已排除）'); return; }

  addLog('info', '[系统] 重测未达标项');
  setDetectBusy(true);
  updateStatus('running', '重测中');

  try {
    const r = await fetch('/api/detect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: tasks, merge: true })
    });
    const data = await r.json();
    if (!data.success) { addLog('error', '[错误] ' + data.error); setDetectBusy(false); }
  } catch (e) {
    addLog('error', '[错误] 重测启动失败: ' + e.message);
    setDetectBusy(false);
  }
}

// 单链接重新检测（结果表里的「重新检测」按钮）
async function redetect(platform, url) {
  if (redetectingUrls[url]) return;
  try {
    const r = await fetch('/api/detect-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: platform, url: url })
    });
    const data = await r.json();
    if (data.success) {
      redetectingUrls[url] = true;
      renderDetectionTable();
      addLog('info', '[系统] 重新检测：' + url);
    } else {
      addLog('error', '[错误] ' + data.error);
    }
  } catch (e) {
    addLog('error', '[错误] 重新检测失败: ' + e.message);
  }
}

// 导出检测结果为 CSV
function exportDetectCsv() {
  const platforms = ['zhihu', 'toutiao', 'csdn', 'baidu'];
  const rows = [['平台', '链接', '标题', '我的评论', '点赞', '收藏', '状态']];
  let any = false;
  platforms.forEach(function (p) {
    (detectionData[p] || []).forEach(function (r) {
      any = true;
      const cmt = (r.commentCount === null || r.commentCount === undefined) ? '未知' : r.commentCount;
      const like = (r.liked === null || r.liked === undefined) ? '未知' : (r.liked ? '是' : '否');
      const col = (r.collected === null || r.collected === undefined) ? '未知' : (r.collected ? '是' : '否');
      const st = r.error ? ('失败: ' + r.error) : '成功';
      rows.push([PLATFORM_LABELS[p] || p, r.url, r.title || '', cmt, like, col, st]);
    });
  });
  if (!any) { alert('暂无检测结果可导出'); return; }
  const csv = rows.map(function (row) {
    return row.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '检测结果_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// 清空检测结果
function clearDetect() {
  if (!confirm('清空当前检测结果？（不会影响已发表的评论）')) return;
  detectionData = {};
  redetectingUrls = {};
  renderDetectionTable();
  const prog = document.getElementById('detect-progress');
  if (prog) prog.textContent = '尚未开始';
}

// ===== 批量导入相关 =====

// 从文本中提取所有 http(s) 链接
function extractUrls(text) {
  const matches = text.match(/https?:\/\/[^\s,，;；)）\]]+/gi) || [];
  return matches.map(u => u.trim());
}

// 按文章 URL 路径分类（只认文章页，过滤平台首页/后台等）
function classifyUrl(url) {
  const u = url.toLowerCase();
  if (/zhuanlan\.zhihu\.com\/p\//.test(u) || /zhihu\.com\/p\//.test(u)) return 'zhihu';
  if (/toutiao\.com\/article\//.test(u)) return 'toutiao';
  if (/csdn\.net\/[^/]*\/article\/details\//.test(u)) return 'csdn';
  if (/sohu\.com\/a\//.test(u)) return 'sohu';
  if (/baijiahao\.baidu\.com\/s\?id=/.test(u)) return 'baidu';
  return 'unknown';
}

// 分类并回填（从 textarea 读取）
function classifyAndFill() {
  const text = (document.getElementById('import-textarea') || {}).value || '';
  if (!text.trim()) {
    alert('请先粘贴链接或上传文件');
    return;
  }
  const urls = extractUrls(text);
  if (urls.length === 0) {
    alert('未找到有效链接（需以 http 开头）');
    return;
  }
  doClassify(urls);
}

// 处理 Excel/CSV 文件上传
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const allText = [];
      workbook.SheetNames.forEach(function(sheetName) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        allText.push(csv);
      });
      const combined = allText.join('\n');
      const ta = document.getElementById('import-textarea');
      const existing = ta.value.trim();
      ta.value = existing ? (existing + '\n' + combined) : combined;
      const count = extractUrls(ta.value).length;
      document.getElementById('file-name-display').textContent = '已加载 ' + file.name + '（共 ' + count + ' 条链接）';
    } catch (err) {
      alert('读取文件失败: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// 执行分类并回填
function doClassify(urls) {
  Object.keys(importedUrls).forEach(function(k) { importedUrls[k] = []; });
  const seen = {};
  urls.forEach(function(url) {
    if (seen[url]) return;
    seen[url] = true;
    const p = classifyUrl(url);
    importedUrls[p].push(url);
  });
  renderImportResult();
  refreshCurrentPlatformTextarea();
}

// 渲染分类结果
function renderImportResult() {
  const card = document.getElementById('import-result-card');
  if (!card) return;
  const content = document.getElementById('import-result-content');

  const platforms = ['zhihu', 'toutiao', 'csdn', 'sohu', 'baidu', 'unknown'];
  const total = platforms.reduce(function(s, p) { return s + (importedUrls[p] || []).length; }, 0);

  let html = '<div class="hint-text" style="margin-bottom:10px;">共 ' + total + ' 条链接已分配，点击下方平台卡片可跳转查看已回填的链接</div>';
  html += '<div class="import-result-grid">';
  platforms.forEach(function(p) {
    const list = importedUrls[p] || [];
    let cls = 'import-stat';
    if (list.length === 0) cls += ' empty';
    if (p === 'unknown') cls += ' unknown';
    const click = p === 'unknown' ? '' : ('onclick="switchPlatform(\'' + p + '\')"');
    html += '<div class="' + cls + '" ' + click + '><div class="count">' + list.length + '</div><div class="label">' + PLATFORM_LABELS[p] + '</div></div>';
  });
  html += '</div>';

  if ((importedUrls.unknown || []).length > 0) {
    html += '<div style="margin-top:18px;font-size:13px;color:#f87171;font-weight:500;">未识别链接：</div>';
    html += '<div style="font-size:12px;color:#94a3b8;margin-top:8px;max-height:120px;overflow-y:auto;background:#0f1626;padding:10px;border-radius:6px;">';
    importedUrls.unknown.forEach(function(u) { html += '<div style="margin-bottom:2px;word-break:break-all;">' + u + '</div>'; });
    html += '</div>';
  }

  card.style.display = 'block';
  content.innerHTML = html;
}

// 点击结果卡片跳转到对应平台
function switchPlatform(platform) {
  const item = document.querySelector('.platform-item[data-platform="' + platform + '"]');
  if (item) item.click();
}

// 清空导入内容
function clearImported() {
  Object.keys(importedUrls).forEach(function(k) { importedUrls[k] = []; });
  const ta = document.getElementById('import-textarea');
  if (ta) ta.value = '';
  const fn = document.getElementById('file-name-display');
  if (fn) fn.textContent = '';
  const fi = document.getElementById('import-file');
  if (fi) fi.value = '';
  const card = document.getElementById('import-result-card');
  if (card) card.style.display = 'none';
}

// 分类后若当前正在看某个平台页，刷新其 textarea
function refreshCurrentPlatformTextarea() {
  if (['zhihu', 'toutiao', 'csdn', 'sohu', 'baidu'].indexOf(currentPlatform) >= 0) {
    const ta = document.getElementById('article-urls');
    if (ta && importedUrls[currentPlatform] && importedUrls[currentPlatform].length) {
      ta.value = importedUrls[currentPlatform].join('\n');
    }
  }
}

// 页面加载时渲染首页
renderContent('config');

// ===== 无边框窗口：自绘标题栏按钮 =====
(function initTitlebar() {
  const api = window.electronAPI;
  if (!api) {
    // 浏览器模式（非 Electron）：隐藏自绘标题栏，用系统标签页的边框
    document.body.classList.add('browser-mode');
    return;
  }
  const min = document.getElementById('tb-min');
  const max = document.getElementById('tb-max');
  const closeBtn = document.getElementById('tb-close');
  if (min) min.addEventListener('click', () => api.minimize());
  if (max) max.addEventListener('click', () => api.toggleMaximize());
  if (closeBtn) closeBtn.addEventListener('click', () => api.close());
})();
