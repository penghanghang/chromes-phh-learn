// ======================= 全局变量 =======================
let isEnabled = true;
let skipStartSeconds = 60;
let showLogPanel = true;
let defaultPlaybackRate = 1.0;       // 默认倍速
let hasSkippedStart = false;
let clickedNext = false;
let clickedPrev = false;
let currentVideo = null;
let episodeButtons = [];
let totalEpisodes = 0;
let firstEpisode = null;
let lastEpisode = null;
let scanDone = false;
let isScanning = false;
let cachedEpisode = null;
let cachedUrl = null;

// 倍速相关
let rateSet = false;                  // 是否已设置过倍速
let currentPlaybackRate = 1.0;

// 集数识别配置
let episodeConfig = {
  minEpisode: 1,
  maxEpisode: 500,
  mustKeywords: ['集', '第'],
  excludeKeywords: ['评论', '回复', '点赞', '收藏', '分享', '举报', '弹幕', '下一页', '上一页', '首页', '尾页', '播放量', '观看', '人气', '时长', '总集数', '完结', '预告', '花絮', '推荐'],
  customSelector: '',
  excludeUrlKeywords: ['comment', 'review', 'user', 'account', 'search']
};

// ======================= 日志函数 =======================
window.pluginLog = function(msg, isError = false) {
  if (!showLogPanel) return;
  const logPanel = document.getElementById('plugin-log-panel');
  if (!logPanel) return;
  const line = document.createElement('div');
  line.textContent = new Date().toLocaleTimeString().slice(0,8) + ' ' + msg;
  line.style.color = isError ? '#f66' : '#0f0';
  line.style.borderBottom = '1px solid #333';
  line.style.padding = '3px 2px';
  line.style.fontSize = '10px';
  logPanel.appendChild(line);
  logPanel.scrollTop = logPanel.scrollHeight;
  while (logPanel.children.length > 40) logPanel.removeChild(logPanel.firstChild);
};

function addPageLogger() {
  if (!showLogPanel) return;
  if (document.getElementById('plugin-log-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'plugin-log-panel';
  panel.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    width: 420px;
    max-height: 250px;
    background: rgba(0,0,0,0.8);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    padding: 8px;
    border-radius: 8px;
    z-index: 9999;
    overflow-y: auto;
    pointer-events: auto;
    border: 1px solid #0f0;
  `;
  document.body.appendChild(panel);
  pluginLog('📌 日志面板已启动');
}

// ======================= 配置加载 =======================
async function loadConfig() {
  const result = await chrome.storage.local.get([
    'enabled', 'skipStartSeconds', 'showLogPanel', 'defaultPlaybackRate',
    'minEpisode', 'maxEpisode', 'mustKeywords', 'excludeKeywords', 'customSelector', 'excludeUrlKeywords'
  ]);
  
  isEnabled = result.enabled !== undefined ? result.enabled : true;
  skipStartSeconds = result.skipStartSeconds !== undefined ? result.skipStartSeconds : 60;
  showLogPanel = result.showLogPanel !== undefined ? result.showLogPanel : true;
  defaultPlaybackRate = result.defaultPlaybackRate !== undefined ? result.defaultPlaybackRate : 1.0;
  
  episodeConfig.minEpisode = result.minEpisode !== undefined ? result.minEpisode : 1;
  episodeConfig.maxEpisode = result.maxEpisode !== undefined ? result.maxEpisode : 500;
  episodeConfig.mustKeywords = result.mustKeywords ? result.mustKeywords.split(',').map(s => s.trim()) : ['集', '第'];
  episodeConfig.excludeKeywords = result.excludeKeywords ? result.excludeKeywords.split(',').map(s => s.trim().toLowerCase()) : [];
  episodeConfig.customSelector = result.customSelector || '';
  episodeConfig.excludeUrlKeywords = result.excludeUrlKeywords ? result.excludeUrlKeywords.split(',').map(s => s.trim().toLowerCase()) : [];
  
  if (showLogPanel) {
    addPageLogger();
  } else {
    const panel = document.getElementById('plugin-log-panel');
    if (panel) panel.remove();
  }
  
  pluginLog(`配置加载完成 | 默认倍速: ${defaultPlaybackRate}x`);
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) isEnabled = changes.enabled.newValue;
  if (changes.skipStartSeconds) {
    skipStartSeconds = changes.skipStartSeconds.newValue;
    hasSkippedStart = false;
  }
  if (changes.defaultPlaybackRate) {
    defaultPlaybackRate = changes.defaultPlaybackRate.newValue;
    rateSet = false;  // 重置倍速标记
  }
  if (changes.showLogPanel) {
    showLogPanel = changes.showLogPanel.newValue;
    if (showLogPanel) {
      addPageLogger();
    } else {
      const panel = document.getElementById('plugin-log-panel');
      if (panel) panel.remove();
    }
  }
  loadConfig();
});

// ======================= 倍速播放函数 =======================
function setPlaybackRate(video, rate) {
  if (!video) return;
  try {
    video.playbackRate = rate;
    currentPlaybackRate = rate;
    pluginLog(`⚡ 播放速度设置为 ${rate}x`);
    updateRateButtonDisplay(rate);
  } catch(e) {
    pluginLog(`❌ 设置倍速失败: ${e.message}`, true);
  }
}

function increaseSpeed() {
  const video = currentVideo || document.querySelector('video');
  if (!video) return;
  let newRate = Math.min(3.0, currentPlaybackRate + 0.25);
  setPlaybackRate(video, newRate);
}

function decreaseSpeed() {
  const video = currentVideo || document.querySelector('video');
  if (!video) return;
  let newRate = Math.max(0.5, currentPlaybackRate - 0.25);
  setPlaybackRate(video, newRate);
}

function updateRateButtonDisplay(rate) {
  const rateBtn = document.getElementById('rate-btn');
  if (rateBtn) {
    rateBtn.innerHTML = `${rate.toFixed(2)}x`;
  }
}

// ======================= 1. 跳过片头 =======================
function trySkipStart(video) {
  if (!isEnabled || hasSkippedStart) return;
  if (skipStartSeconds <= 0) {
    hasSkippedStart = true;
    return;
  }
  if (video.currentTime < skipStartSeconds && skipStartSeconds < video.duration) {
    video.currentTime = skipStartSeconds;
    hasSkippedStart = true;
    pluginLog(`⏩ 跳过片头 ${skipStartSeconds}s`);
  } else if (video.currentTime >= skipStartSeconds) {
    hasSkippedStart = true;
  }
}

// ======================= 2. 视频绑定 =======================
function bindVideo(video) {
  if (video.dataset.skipBound) return;
  video.dataset.skipBound = 'true';
  currentVideo = video;
  
  const onPlay = () => {
    // 设置倍速（仅第一次）
    if (!rateSet && defaultPlaybackRate !== 1.0) {
      setPlaybackRate(video, defaultPlaybackRate);
      rateSet = true;
    }
    if (!hasSkippedStart) trySkipStart(video);
    updatePlayPauseButton(true);
  };
  
  const onPause = () => updatePlayPauseButton(false);
  
  const onTimeUpdate = () => {
    if (!hasSkippedStart) {
      trySkipStart(video);
      if (hasSkippedStart) {
        video.removeEventListener('timeupdate', onTimeUpdate);
      }
    }
  };
  
  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('timeupdate', onTimeUpdate);
  
  video.addEventListener('ended', () => {
    if (isEnabled && !clickedNext && scanDone) {
      pluginLog(`📺 自动下一集`);
      clickNextEpisode();
    }
  }, { once: true });
  
  if (video.readyState >= 1 && video.currentTime < skipStartSeconds) {
    trySkipStart(video);
    if (!rateSet && defaultPlaybackRate !== 1.0 && !video.paused) {
      setPlaybackRate(video, defaultPlaybackRate);
      rateSet = true;
    }
  }
  
  pluginLog(`🎬 视频绑定完成`);
}

// ======================= 3. 集数识别 =======================
function isEpisodeElement(el) {
  const text = el.innerText?.trim();
  if (!text || text.length > 20) return false;
  
  const href = el.getAttribute('href') || '';
  const className = (el.className || '').toLowerCase();
  
  for (let kw of episodeConfig.excludeKeywords) {
    if (text.toLowerCase().includes(kw)) return false;
    if (className.includes(kw)) return false;
  }
  
  if (href) {
    for (let kw of episodeConfig.excludeUrlKeywords) {
      if (href.toLowerCase().includes(kw)) return false;
    }
  }
  
  let hasFeature = false;
  for (let kw of episodeConfig.mustKeywords) {
    if (text.includes(kw)) { hasFeature = true; break; }
  }
  if (!hasFeature && href && href.includes('play')) hasFeature = true;
  if (!hasFeature && className.includes('episode')) hasFeature = true;
  if (!hasFeature && /^\d+$/.test(text)) hasFeature = true;
  
  if (!hasFeature) return false;
  
  const numMatch = text.match(/(\d+)/);
  if (!numMatch) return false;
  const num = parseInt(numMatch[1], 10);
  return num >= episodeConfig.minEpisode && num <= episodeConfig.maxEpisode;
}

async function scanEpisodesBatch() {
  if (isScanning || scanDone) return;
  isScanning = true;
  pluginLog('🔍 后台扫描集数...');
  
  const startTime = performance.now();
  let selector = episodeConfig.customSelector || 'a, button, [class*="episode"], [class*="num"], [class*="item"]';
  const elements = document.querySelectorAll(selector);
  
  if (elements.length === 0) {
    pluginLog('⚠️ 未找到元素');
    isScanning = false;
    return;
  }
  
  const buttonsMap = new Map();
  const batchSize = 100;
  let processed = 0;
  
  function processBatch(startIndex) {
    const endIndex = Math.min(startIndex + batchSize, elements.length);
    for (let i = startIndex; i < endIndex; i++) {
      const el = elements[i];
      if (el.offsetParent === null) continue;
      if (!isEpisodeElement(el)) continue;
      
      const text = el.innerText.trim();
      const numMatch = text.match(/(\d+)/);
      if (!numMatch) continue;
      
      let num = parseInt(numMatch[1], 10);
      if (num < episodeConfig.minEpisode || num > episodeConfig.maxEpisode) continue;
      
      let url = el.getAttribute('href');
      if (url && !url.startsWith('http') && !url.startsWith('//')) {
        try { url = new URL(url, location.href).href; } catch(e) { url = null; }
      }
      
      if (!buttonsMap.has(num) || (buttonsMap.has(num) && !buttonsMap.get(num).url && url)) {
        buttonsMap.set(num, { element: el, url: url, text: text });
      }
    }
    
    processed = endIndex;
    if (processed < elements.length) {
      setTimeout(() => processBatch(processed), 16);
    } else {
      finalizeScan(buttonsMap, startTime);
    }
  }
  
  function finalizeScan(map, startTime) {
    episodeButtons = Array.from(map.entries())
      .map(([num, info]) => ({ number: num, element: info.element, url: info.url }))
      .sort((a, b) => a.number - b.number);
    
    totalEpisodes = episodeButtons.length;
    if (totalEpisodes > 0) {
      firstEpisode = episodeButtons[0].number;
      lastEpisode = episodeButtons[totalEpisodes - 1].number;
      scanDone = true;
      const elapsed = performance.now() - startTime;
      pluginLog(`📊 扫描完成: ${totalEpisodes}集 (${firstEpisode}~${lastEpisode}) ${elapsed.toFixed(0)}ms`);
      if (totalEpisodes <= 60) {
        pluginLog(`📋 ${episodeButtons.map(b => b.number).join(', ')}`);
      }
    } else {
      pluginLog(`⚠️ 未检测到集数`, true);
    }
    isScanning = false;
  }
  
  processBatch(0);
}

function scheduleScan() {
  if (scanDone || isScanning) return;
  if (window.requestIdleCallback) {
    requestIdleCallback(() => scanEpisodesBatch(), { timeout: 3000 });
  } else {
    setTimeout(() => scanEpisodesBatch(), 1500);
  }
}

// ======================= 4. 当前集数识别 =======================
function getCurrentEpisode() {
  const url = location.href;
  if (cachedUrl === url && cachedEpisode !== null) return cachedEpisode;
  cachedUrl = url;
  
  if (!scanDone) return null;
  
  for (let btn of episodeButtons) {
    if (btn.url && (url === btn.url || url.endsWith(btn.url.split('/').pop()))) {
      cachedEpisode = btn.number;
      return btn.number;
    }
  }
  
  const urlMatch = url.match(/(\d+)(?:\.html|\.htm|$)/);
  if (urlMatch && episodeButtons.length) {
    const urlNum = parseInt(urlMatch[1], 10);
    for (let btn of episodeButtons) {
      if (Math.abs(btn.number - urlNum) <= 50) {
        cachedEpisode = btn.number;
        return btn.number;
      }
    }
  }
  
  return null;
}

// ======================= 5. 上下集跳转 =======================
function getNextEpisode() {
  if (!scanDone) return null;
  const current = getCurrentEpisode();
  if (current === null) return null;
  
  const idx = episodeButtons.findIndex(b => b.number === current);
  if (idx === -1) return episodeButtons.find(b => b.number > current);
  if (idx + 1 >= episodeButtons.length) return episodeButtons[0];
  return episodeButtons[idx + 1];
}

function getPrevEpisode() {
  if (!scanDone) return null;
  const current = getCurrentEpisode();
  if (current === null) return null;
  
  const idx = episodeButtons.findIndex(b => b.number === current);
  if (idx === -1) return [...episodeButtons].reverse().find(b => b.number < current);
  if (idx === 0) return episodeButtons[episodeButtons.length - 1];
  return episodeButtons[idx - 1];
}

async function clickPrevEpisode() {
  if (!isEnabled || clickedPrev) return;
  clickedPrev = true;
  if (!scanDone) scheduleScan();
  
  const prev = getPrevEpisode();
  if (!prev) {
    pluginLog('❌ 无上一集', true);
    clickedPrev = false;
    return;
  }
  
  pluginLog(`⬅️ 上一集: 第${prev.number}集`);
  if (prev.url && prev.url !== location.href) location.href = prev.url;
  else if (prev.element) prev.element.click();
  setTimeout(() => { clickedPrev = false; }, 2000);
}

async function clickNextEpisode() {
  if (!isEnabled || clickedNext) return;
  clickedNext = true;
  if (!scanDone) scheduleScan();
  
  const next = getNextEpisode();
  if (!next) {
    pluginLog('❌ 无下一集', true);
    clickedNext = false;
    return;
  }
  
  pluginLog(`➡️ 下一集: 第${next.number}集`);
  if (next.url && next.url !== location.href) location.href = next.url;
  else if (next.element) next.element.click();
  setTimeout(() => { clickedNext = false; }, 2000);
}

// ======================= 6. 播放/暂停 =======================
function togglePlayPause() {
  const video = currentVideo || document.querySelector('video');
  if (!video) return;
  video.paused ? video.play() : video.pause();
}

function updatePlayPauseButton(playing) {
  const btn = document.getElementById('play-pause-btn');
  if (btn) btn.innerHTML = playing ? '⏸️ 暂停' : '▶️ 播放';
}

// ======================= 7. 控制按钮（新增倍速控制） =======================
let buttonsAdded = false;
function addControlButtons() {
  if (buttonsAdded) return;
  buttonsAdded = true;
  
  const container = document.createElement('div');
  container.id = 'ctrl-container';
  container.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-family: system-ui, sans-serif;
  `;
  
  // 上一集按钮
  const prevBtn = document.createElement('div');
  prevBtn.innerHTML = '⏪ 上一集';
  prevBtn.style.cssText = `
    background: #f5a623;
    color: white;
    font-size: 14px;
    font-weight: bold;
    padding: 10px 18px;
    border-radius: 30px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: all 0.2s ease;
  `;
  prevBtn.onmouseenter = () => { prevBtn.style.background = '#f5b043'; prevBtn.style.transform = 'scale(1.02)'; };
  prevBtn.onmouseleave = () => { prevBtn.style.background = '#f5a623'; prevBtn.style.transform = 'scale(1)'; };
  prevBtn.onclick = () => clickPrevEpisode();
  
  // 下一集按钮
  const nextBtn = document.createElement('div');
  nextBtn.innerHTML = '⏩ 下一集';
  nextBtn.style.cssText = `
    background: #4c6ef5;
    color: white;
    font-size: 14px;
    font-weight: bold;
    padding: 10px 18px;
    border-radius: 30px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: all 0.2s ease;
  `;
  nextBtn.onmouseenter = () => { nextBtn.style.background = '#5f7bf6'; nextBtn.style.transform = 'scale(1.02)'; };
  nextBtn.onmouseleave = () => { nextBtn.style.background = '#4c6ef5'; nextBtn.style.transform = 'scale(1)'; };
  nextBtn.onclick = () => clickNextEpisode();
  
  // 播放/暂停按钮
  const playPauseBtn = document.createElement('div');
  playPauseBtn.id = 'play-pause-btn';
  playPauseBtn.innerHTML = '▶️ 播放';
  playPauseBtn.style.cssText = `
    background: #28a745;
    color: white;
    font-size: 14px;
    font-weight: bold;
    padding: 10px 18px;
    border-radius: 30px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: all 0.2s ease;
  `;
  playPauseBtn.onmouseenter = () => { playPauseBtn.style.background = '#34ce57'; playPauseBtn.style.transform = 'scale(1.02)'; };
  playPauseBtn.onmouseleave = () => { playPauseBtn.style.background = '#28a745'; playPauseBtn.style.transform = 'scale(1)'; };
  playPauseBtn.onclick = () => togglePlayPause();
  
  // 倍速控制容器
  const rateContainer = document.createElement('div');
  rateContainer.style.cssText = `display: flex; gap: 5px; align-items: center;`;
  
  // 减速按钮 (-)
  const speedDownBtn = document.createElement('div');
  speedDownBtn.innerHTML = '−';
  speedDownBtn.style.cssText = `
    background: #6c757d;
    color: white;
    font-size: 18px;
    font-weight: bold;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  `;
  speedDownBtn.onmouseenter = () => { speedDownBtn.style.background = '#5a6268'; };
  speedDownBtn.onmouseleave = () => { speedDownBtn.style.background = '#6c757d'; };
  speedDownBtn.onclick = () => decreaseSpeed();
  
  // 倍速显示按钮（点击切换常用倍速）
  const rateBtn = document.createElement('div');
  rateBtn.id = 'rate-btn';
  rateBtn.innerHTML = `${defaultPlaybackRate.toFixed(2)}x`;
  rateBtn.style.cssText = `
    background: #17a2b8;
    color: white;
    font-size: 12px;
    font-weight: bold;
    width: 60px;
    height: 36px;
    border-radius: 30px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  `;
  rateBtn.onmouseenter = () => { rateBtn.style.background = '#138496'; };
  rateBtn.onmouseleave = () => { rateBtn.style.background = '#17a2b8'; };
  rateBtn.onclick = () => {
    const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
    let current = currentPlaybackRate;
    let next = rates[0];
    for (let i = 0; i < rates.length; i++) {
      if (rates[i] > current + 0.01) {
        next = rates[i];
        break;
      }
    }
    setPlaybackRate(currentVideo || document.querySelector('video'), next);
  };
  
  // 加速按钮 (+)
  const speedUpBtn = document.createElement('div');
  speedUpBtn.innerHTML = '+';
  speedUpBtn.style.cssText = `
    background: #6c757d;
    color: white;
    font-size: 18px;
    font-weight: bold;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  `;
  speedUpBtn.onmouseenter = () => { speedUpBtn.style.background = '#5a6268'; };
  speedUpBtn.onmouseleave = () => { speedUpBtn.style.background = '#6c757d'; };
  speedUpBtn.onclick = () => increaseSpeed();
  
  rateContainer.appendChild(speedDownBtn);
  rateContainer.appendChild(rateBtn);
  rateContainer.appendChild(speedUpBtn);
  
  container.appendChild(prevBtn);
  container.appendChild(nextBtn);
  container.appendChild(playPauseBtn);
  container.appendChild(rateContainer);
  
  document.body.appendChild(container);
  pluginLog('✅ 控制按钮已添加（含倍速控制）');
}

// ======================= 8. 初始化 =======================
function init() {
  loadConfig().then(() => {
    document.querySelectorAll('video').forEach(v => bindVideo(v));
    addControlButtons();
    setTimeout(scheduleScan, 1000);
    
    new MutationObserver(() => {
      document.querySelectorAll('video').forEach(v => {
        if (!v.dataset.skipBound) bindVideo(v);
      });
    }).observe(document.body, { childList: true, subtree: true });
    
    pluginLog('🚀 视频助手已启动（倍速播放版）');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}