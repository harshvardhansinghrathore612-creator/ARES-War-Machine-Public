const https = require('https');

const TOOLS = [
  { id: 'subfinder', name: ' Subfinder', desc: 'Find subdomains', input: 'domain' },
  { id: 'amass', name: ' Amass', desc: 'Deep subdomain discovery', input: 'domain' },
  { id: 'httpx', name: ' HTTPX', desc: 'Find live hosts', input: 'domain' },
  { id: 'naabu', name: ' Naabu', desc: 'Port scanning', input: 'domain' },
  { id: 'paramspider', name: ' ParamSpider', desc: 'Find parameters', input: 'domain' },
  { id: 'arjun', name: ' Arjun', desc: 'Hidden params', input: 'url' },
  { id: 'nuclei', name: ' Nuclei', desc: 'Vuln templates', input: 'domain' },
  { id: 'nikto', name: ' Nikto', desc: 'Web server scan', input: 'url' },
  { id: 'ffuf', name: '📁 FFUF', desc: 'Dir fuzzing', input: 'url' },
  { id: 'feroxbuster', name: ' Feroxbuster', desc: 'Recursive discovery', input: 'url' },
  { id: 'dalfox', name: ' Dalfox', desc: 'XSS scanner', input: 'params' },
  { id: 'xsstrike', name: ' XSStrike', desc: 'Advanced XSS', input: 'params' },
  { id: 'sqlmap', name: ' SQLMap', desc: 'SQL injection', input: 'params' },
  { id: 'ghauri', name: ' Ghauri', desc: 'Advanced SQLi', input: 'params' },
  { id: 'ssrfmap', name: ' SSRFmap', desc: 'SSRF testing', input: 'params' },
  { id: 'lfimap', name: ' LFImap', desc: 'LFI scanner', input: 'params' },
  { id: 'openredirex', name: ' OpenRedireX', desc: 'Open redirect', input: 'params' },
  { id: 'crlfuzz', name: ' CRLFuzz', desc: 'CRLF injection', input: 'url' },
  { id: 'commix', name: ' Commix', desc: 'Command injection', input: 'params' },
  { id: 'tplmap', name: ' Tplmap', desc: 'SSTI scanner', input: 'params' },
  { id: 'subzy', name: ' Subzy', desc: 'Subdomain takeover', input: 'domain' },
  { id: 'gitleaks', name: ' Gitleaks', desc: 'Secret detection', input: 'any' }
];

const GH_TOKEN = process.env.GIT_PAT || process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_REPO || '';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

function tg(method, data) {
  return new Promise(r => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TG_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{r(JSON.parse(d))}catch{r({})} }); });
    req.on('error', ()=>r({}));
    req.write(body);
    req.end();
  });
}

function triggerWorkflow(scanType, target) {
  return new Promise(r => {
    if (!GH_TOKEN || !GH_REPO) { r({ ok: false, error: 'Missing GH_TOKEN or GH_REPO' }); return; }
    
    const body = JSON.stringify({
      ref: 'main',
      inputs: {
        scan_type: scanType,
        target: target
      }
    });
    
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GH_REPO}/actions/workflows/ares.yml/dispatches`,
      method: 'POST',
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ARES-Bot'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 204) r({ ok: true });
        else r({ ok: false, status: res.statusCode, body: data });
      });
    });
    
    req.on('error', e => r({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  // Landing page for GET requests
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: 'ARES Bot Active!', headers: { 'Content-Type': 'text/plain' } };
  }

  try {
    const update = JSON.parse(event.body || '{}');
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const msgId = update.callback_query?.message?.message_id;
    const text = (update.message?.text || '').trim();
    const data = update.callback_query?.data || '';
    
    if (!chatId) return { statusCode: 200, body: 'OK' };
    
    if (update.callback_query) {
      await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });
    }

    // MAIN MENU
    if (text === '/start' || data === 'menu') {
      await tg('sendMessage', { 
        chat_id: chatId, 
        text: ' *ARES Vulnerability Scanner*\n\nChoose an option:', 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: ' FULL SCAN', callback_data: 'full' }],
          [{ text: '📋 STEP-BY-STEP', callback_data: 'step' }],
          [{ text: '📊 STATUS', callback_data: 'status' }]
        ]}
      });
      return { statusCode: 200, body: 'OK' };
    }

    // FULL SCAN - ask for target
    if (data === 'full') {
      await tg('editMessageText', { 
        chat_id: chatId, 
        message_id: msgId,
        text: '🔥 *FULL SCAN*\n\nSend target domain:\n`example.com`', 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // STEP-BY-STEP - show tools
    if (data === 'step') {
      let msg = ' *Step-by-Step Scan*\n\nSelect a tool:\n\n';
      TOOLS.forEach((t, i) => { msg += `${i+1}. ${t.name}\n`; });
      
      const kb = [];
      for (let i = 0; i < TOOLS.length; i += 2) {
        const row = [{ text: TOOLS[i].name, callback_data: `t:${i}` }];
        if (TOOLS[i+1]) row.push({ text: TOOLS[i+1].name, callback_data: `t:${i+1}` });
        kb.push(row);
      }
      kb.push([{ text: ' Back', callback_data: 'menu' }]);
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: msg, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: kb }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // TOOL SELECTED
    if (data.startsWith('t:')) {
      const idx = parseInt(data.split(':')[1]);
      const tool = TOOLS[idx];
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: `${tool.name}\n\n${tool.desc}\n\n Send target:`, 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'step' }]] }
      });
      // Store selected tool
      await tg('sendMessage', { chat_id: chatId, text: `_SCAN:${tool.id}_`, parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    // STATUS
    if (data === 'status') {
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ` Check scans at:\nhttps://github.com/${GH_REPO}/actions`, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // RECEIVED TARGET - trigger workflow
    if (text && !text.startsWith('/') && !text.startsWith('_')) {
      // Extract domain/URL
      let target = text.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
      
      // Trigger the workflow
      const result = await triggerWorkflow('all', target);
      
      let msg;
      if (result.ok) {
        msg = ` *Scan Started!*\n\n Target: \`${target}\`\n\n [View Progress](https://github.com/${GH_REPO}/actions)`;
      } else {
        msg = ` *Failed to start scan*\n\nError: ${result.error || result.status || 'Unknown'}\n\n_Check GIT_PAT token in Netlify_`;
      }
      
      await tg('sendMessage', { 
        chat_id: chatId, 
        text: msg, 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' New Scan', callback_data: 'menu' }]] }
      });
      return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    console.error('Error:', e);
    return { statusCode: 200, body: 'OK' };
  }
};