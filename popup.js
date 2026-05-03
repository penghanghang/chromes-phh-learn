const toggleBtn = document.getElementById('enableToggle');
const skipStartInput = document.getElementById('skipStartSeconds');
const showLogPanelCheckbox = document.getElementById('showLogPanel');
const minEpisodeInput = document.getElementById('minEpisode');
const maxEpisodeInput = document.getElementById('maxEpisode');
const mustKeywordsInput = document.getElementById('mustKeywords');
const excludeKeywordsInput = document.getElementById('excludeKeywords');
const customSelectorInput = document.getElementById('customSelector');
const excludeUrlKeywordsInput = document.getElementById('excludeUrlKeywords');
const saveBtn = document.getElementById('saveBtn');
const statusMsg = document.getElementById('statusMsg');

async function loadConfig() {
  const result = await chrome.storage.local.get([
    'enabled', 'skipStartSeconds', 'showLogPanel',
    'minEpisode', 'maxEpisode', 'mustKeywords', 'excludeKeywords', 'customSelector', 'excludeUrlKeywords'
  ]);
  
  const enabled = result.enabled !== undefined ? result.enabled : true;
  if (enabled) toggleBtn.classList.add('active');
  else toggleBtn.classList.remove('active');
  
  skipStartInput.value = result.skipStartSeconds !== undefined ? result.skipStartSeconds : 60;
  showLogPanelCheckbox.checked = result.showLogPanel !== undefined ? result.showLogPanel : true;
  
  minEpisodeInput.value = result.minEpisode !== undefined ? result.minEpisode : 1;
  maxEpisodeInput.value = result.maxEpisode !== undefined ? result.maxEpisode : 500;
  mustKeywordsInput.value = result.mustKeywords !== undefined ? result.mustKeywords : '集,第';
  excludeKeywordsInput.value = result.excludeKeywords !== undefined ? result.excludeKeywords : '评论,回复,点赞,收藏,分享,举报,弹幕,下一页,上一页,首页,尾页,播放量,观看,人气,时长,总集数,完结,预告,花絮,推荐';
  customSelectorInput.value = result.customSelector !== undefined ? result.customSelector : '';
  excludeUrlKeywordsInput.value = result.excludeUrlKeywords !== undefined ? result.excludeUrlKeywords : 'comment,review,user,account,search';
}

async function saveConfig() {
  const enabled = toggleBtn.classList.contains('active');
  const skipStartSeconds = parseInt(skipStartInput.value, 10);
  const showLogPanel = showLogPanelCheckbox.checked;
  const minEpisode = parseInt(minEpisodeInput.value, 10);
  const maxEpisode = parseInt(maxEpisodeInput.value, 10);
  const mustKeywords = mustKeywordsInput.value.trim();
  const excludeKeywords = excludeKeywordsInput.value.trim();
  const customSelector = customSelectorInput.value.trim();
  const excludeUrlKeywords = excludeUrlKeywordsInput.value.trim();
  
  if (isNaN(skipStartSeconds) || skipStartSeconds < 0) {
    statusMsg.innerText = '❌ 请输入有效秒数';
    return;
  }
  if (isNaN(minEpisode) || minEpisode < 1) {
    statusMsg.innerText = '❌ 最小集数需≥1';
    return;
  }
  if (isNaN(maxEpisode) || maxEpisode < minEpisode) {
    statusMsg.innerText = '❌ 最大集数需≥最小集数';
    return;
  }
  
  await chrome.storage.local.set({
    enabled: enabled,
    skipStartSeconds: skipStartSeconds,
    showLogPanel: showLogPanel,
    minEpisode: minEpisode,
    maxEpisode: maxEpisode,
    mustKeywords: mustKeywords,
    excludeKeywords: excludeKeywords,
    customSelector: customSelector,
    excludeUrlKeywords: excludeUrlKeywords
  });
  
  statusMsg.innerText = '✅ 已保存，刷新页面生效';
  setTimeout(() => { statusMsg.innerText = '就绪'; }, 2000);
}

toggleBtn.addEventListener('click', () => {
  toggleBtn.classList.toggle('active');
});

saveBtn.addEventListener('click', saveConfig);
loadConfig();