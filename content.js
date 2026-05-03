// ======================= 配置 =======================
let isEnabled = true;
let skipSeconds = 60;
let hasSkipped = false;
let clickedNext = false;
let currentVideo = null;

// 加载配置
async function loadConfig() {
  const result = await chrome.storage.local.get(['enabled', 'skipSeconds']);
  isEnabled = result.enabled !== undefined ? result.enabled : true;
  skipSeconds = result.skipSeconds !== undefined ? result.skipSeconds : 60;
  console.log(`配置: 启用=${isEnabled}, 跳过秒数=${skipSeconds}`);
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) isEnabled = changes.enabled.newValue;
  if (changes.skipSeconds) skipSeconds = changes.skipSeconds.newValue;
});

// ======================= 1. 固定时间跳过片头 =======================
function trySkipIntro() {
  if (!isEnabled || !currentVideo || hasSkipped) return;
  if (currentVideo.currentTime < skipSeconds && skipSeconds > 0) {
    console.log(`跳过片头: ${currentVideo.currentTime.toFixed(1)}s → ${skipSeconds}s`);
    currentVideo.currentTime = skipSeconds;
    hasSkipped = true;
  } else if (currentVideo.currentTime >= skipSeconds) {
    hasSkipped = true;
  }
}

function bindVideo(video) {
  if (video.dataset.skipBound) return;
  video.dataset.skipBound = 'true';
  currentVideo = video;
  video.addEventListener('play', () => trySkipIntro());
  video.addEventListener('timeupdate', () => {
    if (!hasSkipped && video.currentTime < skipSeconds) trySkipIntro();
    else if (video.currentTime >= skipSeconds) hasSkipped = true;
  });
  video.addEventListener('ended', () => {
    if (isEnabled && !clickedNext) {
      console.log('视频播放结束，尝试自动下一集');
      clickNextEpisode();
    }
  });
  if (video.readyState >= 1) trySkipIntro();
}

// ======================= 2. 智能识别集数按钮（增强版） =======================
// 从元素中提取集数（支持文字、数字、href）
function extractEpisodeNumber(el) {
  // 优先从文字提取
  let text = el.innerText?.trim() || '';
  let match = text.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  // 从 href 提取
  let href = el.getAttribute('href') || '';
  match = href.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  // 从 data-* 属性提取
  let dataEp = el.getAttribute('data-episode') || el.getAttribute('data-num');
  if (dataEp) return parseInt(dataEp, 10);
  return null;
}

// 获取当前播放的集数（通过高亮样式或URL）
function getCurrentEpisode() {
  // 1. 查找高亮元素（常见 active/current/on 类）
  const activeSelectors = [
    '.active', '.current', '.on', '.selected', '.playing',
    '[class*="active"]', '[class*="current"]', '[class*="on"]'
  ];
  for (let sel of activeSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const num = extractEpisodeNumber(el);
      if (num !== null) return num;
    }
  }
  // 2. 从 URL 中提取（如 /play/318052-32-2938102.html -> 2938102）
  const urlMatch = window.location.href.match(/(\d+)\.html$/);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  // 3. 从页面标题提取（如 "第3集"）
  const titleMatch = document.title.match(/第\s*(\d+)\s*集/);
  if (titleMatch) return parseInt(titleMatch[1], 10);
  return null;
}

// 获取所有集数按钮（超广匹配）
function getAllEpisodeButtons() {
  // 尽可能多的选择器，覆盖各种网站结构
  const selectors = [
    'a', 'button', 'div', 'span', 'li', 'td'
  ];
  const candidates = new Set();
  for (let sel of selectors) {
    const elements = document.querySelectorAll(sel);
    for (let el of elements) {
      // 过滤：必须有数字，且数字不太大（集数一般小于500）
      const num = extractEpisodeNumber(el);
      if (num !== null && num > 0 && num < 2000) {
        // 进一步过滤：检查元素是否可能是集数按钮
        const text = el.innerText?.trim() || '';
        const href = el.getAttribute('href') || '';
        // 如果文字或链接包含 "集"、"第"、"episode"、"play"，或者数字单独出现（如 "3"）
        if (text.match(/(集|第|episode|play|\b\d{1,3}\b)/i) || href.match(/(episode|play)/i)) {
          candidates.add(el);
        }
      }
    }
  }
  // 去重并转换为数组
  const buttons = Array.from(candidates).map(el => ({
    element: el,
    number: extractEpisodeNumber(el)
  }));
  // 按数字排序
  buttons.sort((a, b) => a.number - b.number);
  // 去重（相同数字只保留第一个）
  const unique = [];
  const seen = new Set();
  for (let btn of buttons) {
    if (!seen.has(btn.number)) {
      seen.add(btn.number);
      unique.push(btn);
    }
  }
  console.log(`找到集数按钮: ${unique.map(b => b.number).join(', ')}`);
  return unique;
}

// 点击下一集
async function clickNextEpisode() {
  if (!isEnabled || clickedNext) return;
  const currentEp = getCurrentEpisode();
  if (currentEp === null) {
    console.log('无法识别当前集数');
    return;
  }
  console.log(`当前集数: ${currentEp}`);
  const allButtons = getAllEpisodeButtons();
  if (allButtons.length === 0) {
    console.log('未找到任何集数按钮');
    return;
  }
  const idx = allButtons.findIndex(btn => btn.number === currentEp);
  if (idx === -1) {
    console.log(`当前集数 ${currentEp} 不在按钮列表中，可能是特殊ID，尝试找下一个更大的数字`);
    // 如果找不到精确匹配，尝试找比当前数字大的最小集数
    const nextBtn = allButtons.find(btn => btn.number > currentEp);
    if (nextBtn) {
      console.log(`通过大小匹配找到下一集: ${nextBtn.number}`);
      clickedNext = true;
      nextBtn.element.click();
      setTimeout(() => { clickedNext = false; }, 5000);
    }
    return;
  }
  if (idx + 1 >= allButtons.length) {
    console.log('已是最后一集');
    return;
  }
  const nextBtn = allButtons[idx + 1];
  console.log(`点击下一集: ${nextBtn.number}`);
  clickedNext = true;
  nextBtn.element.click();
  setTimeout(() => { clickedNext = false; }, 5000);
}

// ======================= 3. 监听视频和页面变化 =======================
function observeVideos() {
  document.querySelectorAll('video').forEach(v => bindVideo(v));
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === 'VIDEO') bindVideo(node);
        else if (node.querySelectorAll) node.querySelectorAll('video').forEach(v => bindVideo(v));
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function resetOnNavigation() {
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      hasSkipped = false;
      clickedNext = false;
      currentVideo = null;
      console.log('URL变化，重置状态');
      observeVideos();
    }
  }).observe(document, { subtree: true, childList: true });
}

// ======================= 启动 =======================
(async () => {
  await loadConfig();
  resetOnNavigation();
  observeVideos();
  console.log('增强版插件已启动');
})();