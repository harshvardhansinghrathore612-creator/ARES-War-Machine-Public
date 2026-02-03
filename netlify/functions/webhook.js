const https = require('https');

const TOOLS = {
  subfinder: { name: ' Subfinder', needs: [] },
  amass: { name: ' Amass', needs: [] },
  httpx: { name: ' HTTPX', needs: ['subfinder'] },
  naabu: { name: ' Naabu', needs: [] },
  paramspider: { name: ' ParamSpider', needs: [] },
  arjun: { name: ' Arjun', needs: [] },
  nuclei: { name: ' Nuclei', needs: ['httpx'] },
  nikto: { name: ' Nikto', needs: [] },
  ffuf: { name: ' FFUF', needs: [] },
  feroxbuster: { name: ' Feroxbuster', needs: [] },
  dalfox: { name: ' Dalfox', needs: ['paramspider'] },
  xsstrike: { name: '⚡ XSStrike', needs: ['paramspider'] },
  sqlmap: { name: '💾 SQLMap', needs: ['paramspider'] },
  ghauri: { name: ' Ghauri', needs: ['paramspider'] },
  ssrfmap: { name: ' SSRFmap', needs: ['paramspider'] },
  lfimap: { name: ' LFImap', needs: ['paramspider'] },
  openredirex: { name: ' OpenRedireX', needs: ['paramspider'] },
  crlfuzz: { name: ' CRLFuzz', needs: [] },
  commix: { name: ' Commix', needs: ['paramspider'] },
  tplmap: { name: ' Tplmap', needs: ['paramspider'] },
  subzy: { name: ' Subzy', needs: ['subfinder'] },
  gitleaks: { name: ' Gitleaks', needs: [] },
};

const userStates = {};

function sendTelegram(method, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendMessage(chatId, text, keyboard) {
  const data = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (keyboard) data.reply_markup = { inline_keyboard: keyboard };
  return sendTelegram('sendMessage', data);
}

function editMessage(chatId, messageId, text, keyboard) {
  const data = { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' };
  if (keyboard) data.reply_markup = { inline_keyboard: keyboard };
  return sendTelegram('editMessageText', data);
}

async function triggerWorkflow(tools, target) {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) return [false, ' GitHub not configured'];
  
  const body = JSON.stringify({ ref: 'main', inputs: { scan_type: tools.join(','), target } });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${process.env.GITHUB_REPO}/actions/workflows/ares.yml/dispatches`,
      method: 'POST',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'ARES-Bot'
      }
    }, res => {
      resolve(res.statusCode === 204 ? [true, ' Scan started!'] : [false, ` Error ${res.statusCode}`]);
    });
    req.on('error', () => resolve([false, ' Network error']));
    req.write(body);
    req.end();
  });
}

async function handleStart(chatId) {
  userStates[chatId] = { selected: new Set(), state: 'menu', targets: [] };
  const keyboard = [
    [{ text: ' FULL SCAN', callback_data: 'full' }],
    [{ text: ' SELECT TOOLS', callback_data: 'tools' }],
    [{ text: ' MULTI-URL', callback_data: 'multi' }],
    [{ text: ' Status', callback_data: 'status' }],
  ];
  const text = ` *ARES Scanner*\n\n Full Scan - All 20+ tools\n Select Tools - Pick scanners\n Multi-URL - Multiple targets`;
  await sendMessage(chatId, text, keyboard);
}

async function handleCallback(chatId, messageId, data) {
  const state = userStates[chatId] || { selected: new Set(), state: 'menu', targets: [] };
  userStates[chatId] = state;

  if (data === 'menu') return handleStart(chatId);
  
  if (data === 'full') {
    state.selected = new Set(Object.keys(TOOLS));
    state.state = 'waiting_target';
    await editMessage(chatId, messageId, ' Enter target domain:', [[{ text: ' Cancel', callback_data: 'menu' }]]);
    return;
  }
  
  if (data === 'multi') {
    state.selected = new Set(Object.keys(TOOLS));
    state.state = 'waiting_multi';
    state.targets = [];
    await editMessage(chatId, messageId, ' Send URLs (one per line):\n\n`example.com`\n`https://target.com?id=1`\n\nSend /done when finished.', [[{ text: ' Cancel', callback_data: 'menu' }]]);
    return;
  }
  
  if (data === 'tools') {
    state.state = 'tools';
    const keyboard = [];
    let row = [];
    for (const [tid, tool] of Object.entries(TOOLS)) {
      const check = state.selected.has(tid) ? '' : '';
      row.push({ text: `${check}${tool.name.split(' ')[0]}`, callback_data: `t_${tid}` });
      if (row.length === 3) { keyboard.push(row); row = []; }
    }
    if (row.length) keyboard.push(row);
    keyboard.push([{ text: ' All', callback_data: 'all' }, { text: ' Clear', callback_data: 'clear' }]);
    keyboard.push([{ text: `🚀 START (${state.selected.size})`, callback_data: 'go' }]);
    keyboard.push([{ text: '⬅️ Back', callback_data: 'menu' }]);
    await editMessage(chatId, messageId, `Select tools (${state.selected.size}):`, keyboard);
    return;
  }
  
  if (data === 'all') { state.selected = new Set(Object.keys(TOOLS)); return handleCallback(chatId, messageId, 'tools'); }
  if (data === 'clear') { state.selected = new Set(); return handleCallback(chatId, messageId, 'tools'); }
  
  if (data.startsWith('t_')) {
    const tid = data.slice(2);
    if (state.selected.has(tid)) state.selected.delete(tid);
    else state.selected.add(tid);
    return handleCallback(chatId, messageId, 'tools');
  }
  
  if (data === 'go') {
    if (state.selected.size === 0) { await editMessage(chatId, messageId, ' Select tools first!'); return; }
    for (const t of state.selected) {
      for (const dep of TOOLS[t]?.needs || []) state.selected.add(dep);
    }
    state.state = 'waiting_target';
    await editMessage(chatId, messageId, ` Enter target (${state.selected.size} tools):`, [[{ text: ' Cancel', callback_data: 'menu' }]]);
  }
}

async function handleText(chatId, text) {
  const state = userStates[chatId] || { state: 'menu' };
  
  if (text === '/start') return handleStart(chatId);
  
  if (state.state === 'waiting_target') {
    let target = text.trim().replace('https://', '').replace('http://', '').split('/')[0];
    const tools = Array.from(state.selected.size ? state.selected : new Set(Object.keys(TOOLS)));
    const [ok, msg] = await triggerWorkflow(tools, target);
    await sendMessage(chatId, `${msg}\n ${target}\n ${tools.length} tools\n\n https://github.com/${process.env.GITHUB_REPO}/actions`, [[{ text: ' New Scan', callback_data: 'menu' }]]);
    state.state = 'menu';
    return;
  }
  
  if (state.state === 'waiting_multi') {
    if (text === '/done') {
      const targets = state.targets || [];
      if (!targets.length) { await sendMessage(chatId, ' No targets!'); return; }
      const tools = Array.from(state.selected.size ? state.selected : new Set(Object.keys(TOOLS)));
      const results = [];
      for (const t of targets) {
        const target = t.trim().replace('https://', '').replace('http://', '').split('/')[0];
        const [ok] = await triggerWorkflow(tools, target);
        results.push(`${ok ? '' : ''} ${target.slice(0, 25)}`);
      }
      await sendMessage(chatId, ` *Started ${targets.length} scans:*\n\n${results.join('\n')}`, [[{ text: ' New Scan', callback_data: 'menu' }]]);
      state.state = 'menu';
      state.targets = [];
    } else {
      const urls = text.split('\n').filter(u => u.trim());
      state.targets = (state.targets || []).concat(urls);
      await sendMessage(chatId, ` Added ${urls.length}. Total: ${state.targets.length}\n\nSend more or /done`);
    }
    return;
  }
  
  return handleStart(chatId);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') return { statusCode: 200, body: 'ARES Bot Running!' };
    
    const update = JSON.parse(event.body);
    
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || '';
      await handleText(chatId, text);
    } else if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const messageId = cb.message.message_id;
      await sendTelegram('answerCallbackQuery', { callback_query_id: cb.id });
      await handleCallback(chatId, messageId, cb.data);
    }
    
    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: 'OK' };
  }
};