// 获取元素
const toggleBtn = document.getElementById('enableToggle');
const skipInput = document.getElementById('skipSeconds');
const saveBtn = document.getElementById('saveBtn');
const statusMsg = document.getElementById('statusMsg');

// 从存储加载配置
async function loadConfig() {
  const result = await chrome.storage.local.get(['enabled', 'skipSeconds']);
  const enabled = result.enabled !== undefined ? result.enabled : true;
  const seconds = result.skipSeconds !== undefined ? result.skipSeconds : 60;
  
  if (enabled) toggleBtn.classList.add('active');
  else toggleBtn.classList.remove('active');
  
  skipInput.value = seconds;
}

// 保存配置
async function saveConfig() {
  const enabled = toggleBtn.classList.contains('active');
  const seconds = parseInt(skipInput.value, 10);
  
  if (isNaN(seconds) || seconds < 0) {
    statusMsg.innerText = '❌ 请输入有效秒数';
    return;
  }
  
  await chrome.storage.local.set({
    enabled: enabled,
    skipSeconds: seconds
  });
  
  statusMsg.innerText = '✅ 已保存';
  setTimeout(() => { statusMsg.innerText = '就绪'; }, 1500);
}

// 开关点击事件
toggleBtn.addEventListener('click', () => {
  toggleBtn.classList.toggle('active');
});

// 保存按钮事件
saveBtn.addEventListener('click', saveConfig);

// 初始化
loadConfig();