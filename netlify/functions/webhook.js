const https = require('https');

// ALL TOOLS with full info
const TOOLS = [
  { id: 'subfinder', name: ' Subfinder', cat: 'Recon', input: 'domain', needs: [] },
  { id: 'amass', name: ' Amass', cat: 'Recon', input: 'domain', needs: [] },
  { id: 'httpx', name: ' HTTPX', cat: 'Probe', input: 'domain', needs: ['subfinder'] },
  { id: 'naabu', name: ' Naabu', cat: 'Ports', input: 'domain', needs: [] },
  { id: 'paramspider', name: ' ParamSpider', cat: 'Params', input: 'domain', needs: [] },
  { id: 'arjun', name: '🎯 Arjun', cat: 'Params', input: 'url', needs: [] },
  { id: 'nuclei', name: '☢️ Nuclei', cat: 'Vuln', input: 'url', needs: ['httpx'] },
  { id: 'nikto', name: ' Nikto', cat: 'Vuln', input: 'url', needs: [] },
  { id: 'dalfox', name: ' Dalfox', cat: 'XSS', input: 'params', needs: ['paramspider'] },
  { id: 'xsstrike', name: ' XSStrike', cat: 'XSS', input: 'params', needs: ['paramspider'] },
  { id: 'sqlmap', name: ' SQLMap', cat: 'SQLi', input: 'params', needs: ['paramspider'] },
  { id: 'ghauri', name: ' Ghauri', cat: 'SQLi', input: 'params', needs: ['paramspider'] },
  { id: 'ssrfmap', name: ' SSRFmap', cat: 'SSRF', input: 'params', needs: ['paramspider'] },
  { id: 'lfimap', name: ' LFImap', cat: 'LFI', input: 'params', needs: ['paramspider'] },
  { id: 'openredirex', name: ' OpenRedireX', cat: 'Redirect', input: 'params', needs: ['paramspider'] },
  { id: 'crlfuzz', name: ' CRLFuzz', cat: 'CRLF', input: 'url', needs: [] },
  { id: 'commix', name: ' Commix', cat: 'CMDi', input: 'params', needs: ['paramspider'] },
  { id: 'tplmap', name: ' Tplmap', cat: 'SSTI', input: 'params', needs: ['paramspider'] },
  { id: 'subzy', name: '🎯 Subzy', cat: 'Takeover', input: 'domain', needs: ['subfinder'] },
  { id: 'ffuf', name: '📁 FFUF', cat: 'Fuzz', input: 'url', needs: [] },
  { id: 'feroxbuster', name: ' Feroxbuster', cat: 'Fuzz', input: 'url', needs: [] },
  { id: 'gitleaks', name: ' Gitleaks', cat: 'Secrets', input: 'domain', needs: [] }
];

// Use GIT_PAT from environment
const GH_TOKEN = process.env.GIT_PAT || process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_REPO;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function tg(method, data) {
  return new Promise(r => {
    const body = JSON.stringify(data);
    const req = https.request({ hostname: 'api.telegram.org', path: `/bot${TG_TOKEN}/${method}`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, 
      res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

async function triggerWorkflow(tools, target) {
  if (!GH_TOKEN || !GH_REPO) return { ok: false, msg: ' GitHub token not set! Add GIT_PAT to Netlify env vars.' };
  const body = JSON.stringify({ ref: 'main', inputs: { scan_type: tools, target } });
  return new Promise(r => {
    const req = https.request({ hostname: 'api.github.com', path: `/repos/${GH_REPO}/actions/workflows/ares.yml/dispatches`, method: 'POST',
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'ARES' }
    }, res => {
      if (res.statusCode === 204) r({ ok: true, msg: ' Scan started!' });
      else r({ ok: false, msg: `❌ GitHub error ${res.statusCode}. Check GIT_PAT token.` });
    });
    req.on('error', () => r({ ok: false, msg: '❌ Network error' }));
    req.write(body); req.end();
  });
}

// Build keyboard with tools
function buildToolsKB(mask) {
  const kb = [];
  const cats = {};
  TOOLS.forEach((t, i) => { if (!cats[t.cat]) cats[t.cat] = []; cats[t.cat].push({ t, i }); });
  
  for (const [cat, tools] of Object.entries(cats)) {
    kb.push([{ text: ` ${cat} `, callback_data: 'noop' }]);
    let row = [];
    tools.forEach(({ t, i }) => {
      const sel = (mask & (1 << i)) ? '' : '';
      row.push({ text: `${sel} ${t.name.split(' ').slice(1).join(' ')}`, callback_data: `t:${mask ^ (1 << i)}` });
      if (row.length === 2) { kb.push(row); row = []; }
    });
    if (row.length) kb.push(row);
  }
  
  const count = TOOLS.filter((_, i) => mask & (1 << i)).length;
  kb.push([{ text: ' Select All', callback_data: `t:${(1 << TOOLS.length) - 1}` }, { text: ' Clear All', callback_data: 't:0' }]);
  kb.push([{ text: `🚀 START SCAN (${count} tools)`, callback_data: `go:${mask}` }]);
  kb.push([{ text: '⬅️ Back to Menu', callback_data: 'menu' }]);
  return kb;
}

// Check dependencies
function checkDeps(mask) {
  const missing = [];
  TOOLS.forEach((t, i) => {
    if (mask & (1 << i)) {
      t.needs.forEach(depId => {
        const depIdx = TOOLS.findIndex(x => x.id === depId);
        if (depIdx >= 0 && !(mask & (1 << depIdx))) {
          const depTool = TOOLS[depIdx];
          if (!missing.find(m => m.id === depId)) missing.push(depTool);
        }
      });
    }
  });
  return missing;
}

// Get required input type
function getInputType(mask) {
  let needsParams = false, needsDomain = false;
  TOOLS.forEach((t, i) => {
    if (mask & (1 << i)) {
      if (t.input === 'params') needsParams = true;
      if (t.input === 'domain') needsDomain = true;
    }
  });
  if (needsParams) return 'params';
  if (needsDomain) return 'domain';
  return 'url';
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') return { statusCode: 200, body: 'ARES Bot OK!' };
    const update = JSON.parse(event.body);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const msgId = update.callback_query?.message?.message_id;
    const text = update.message?.text?.trim() || '';
    const data = update.callback_query?.data || '';
    
    if (update.callback_query) await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });

    // MAIN MENU
    if (text === '/start' || data === 'menu') {
      await tg('sendMessage', { chat_id: chatId, 
        text: ' *ARES Vulnerability Scanner*\n\nWelcome! Choose an option:\n\n Full Scan runs all 22 tools\n Select Tools lets you pick specific ones\n Multi-URL scans multiple targets', 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: ' FULL SCAN (All 22 Tools)', callback_data: 'full' }],
          [{ text: ' SELECT TOOLS', callback_data: 't:0' }],
          [{ text: ' MULTI-URL SCAN', callback_data: 'multi' }],
          [{ text: ' Check Scan Status', callback_data: 'status' }]
        ]}
      });
      return { statusCode: 200, body: 'OK' };
    }

    // NOOP for category headers
    if (data === 'noop') return { statusCode: 200, body: 'OK' };

    // TOOL SELECTION
    if (data.startsWith('t:')) {
      const mask = parseInt(data.split(':')[1]) || 0;
      const count = TOOLS.filter((_, i) => mask & (1 << i)).length;
      const selected = TOOLS.filter((_, i) => mask & (1 << i)).map(t => t.name).join(', ') || 'None';
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, 
        text: ` *Select Tools* (${count} selected)\n\nTap to toggle selection:\n\n_Selected: ${count > 0 ? count + ' tools' : 'None'}_`, 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buildToolsKB(mask) }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // START SCAN - check deps
    if (data.startsWith('go:')) {
      let mask = parseInt(data.split(':')[1]) || 0;
      
      if (mask === 0) {
        await tg('editMessageText', { chat_id: chatId, message_id: msgId, 
          text: ' *No tools selected!*\n\nPlease select at least one tool.',
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: ' Go Back', callback_data: 't:0' }]] }
        });
        return { statusCode: 200, body: 'OK' };
      }
      
      // Check dependencies
      const missing = checkDeps(mask);
      if (missing.length > 0) {
        const missingNames = missing.map(m => m.name).join('\n ');
        const newMask = mask;
        missing.forEach(m => { const idx = TOOLS.findIndex(t => t.id === m.id); if (idx >= 0) mask |= (1 << idx); });
        
        await tg('editMessageText', { chat_id: chatId, message_id: msgId,
          text: ` *Missing Dependencies!*\n\nYour selected tools need:\n ${missingNames}\n\nThese will be added automatically.`,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [
            [{ text: ' Add & Continue', callback_data: `ask:${mask}` }],
            [{ text: ' Edit Selection', callback_data: `t:${newMask}` }]
          ]}
        });
        return { statusCode: 200, body: 'OK' };
      }
      
      // No missing deps - ask for target
      const selectedTools = TOOLS.filter((_, i) => mask & (1 << i));
      const toolsList = selectedTools.map(t => t.name).join('\n');
      const inputType = getInputType(mask);
      
      let inputMsg = '';
      if (inputType === 'params') inputMsg = ' Send URL with parameters:\n`https://example.com/page?id=1`';
      else if (inputType === 'domain') inputMsg = ' Send target domain:\n`example.com`';
      else inputMsg = ' Send target URL or domain:\n`example.com` or `https://example.com`';
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ` *Selected Tools (${selectedTools.length}):*\n${toolsList}\n\n${inputMsg}`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Edit Selection', callback_data: `t:${mask}` }]] }
      });
      
      // Store tools in next message for reference
      const toolIds = selectedTools.map(t => t.id).join(',');
      await tg('sendMessage', { chat_id: chatId, text: `_Tools: ${toolIds}_`, parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    // Ask for target after adding deps
    if (data.startsWith('ask:')) {
      const mask = parseInt(data.split(':')[1]) || 0;
      const selectedTools = TOOLS.filter((_, i) => mask & (1 << i));
      const toolsList = selectedTools.map(t => t.name).join('\n');
      const inputType = getInputType(mask);
      
      let inputMsg = '';
      if (inputType === 'params') inputMsg = ' Send URL with parameters:\n`https://example.com/page?id=1`';
      else if (inputType === 'domain') inputMsg = ' Send target domain:\n`example.com`';
      else inputMsg = ' Send target URL or domain:\n`example.com` or `https://example.com`';
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ` *Selected Tools (${selectedTools.length}):*\n${toolsList}\n\n${inputMsg}`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Edit Selection', callback_data: `t:${mask}` }]] }
      });
      
      const toolIds = selectedTools.map(t => t.id).join(',');
      await tg('sendMessage', { chat_id: chatId, text: `_Tools: ${toolIds}_`, parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    // FULL SCAN
    if (data === 'full') {
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ' *FULL SCAN*\nAll 22 tools will run.\n\n Send target domain:\n`example.com`', 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      await tg('sendMessage', { chat_id: chatId, text: '_Tools: all_', parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    // MULTI-URL
    if (data === 'multi') {
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ' *Multi-URL Scan*\n\nSend targets (one per line):\n```\nexample.com\ntest.org\ntarget.net\n```\n\nSend `/done` when ready.', 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      await tg('sendMessage', { chat_id: chatId, text: '_Mode: multi\nTools: all_', parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    // STATUS
    if (data === 'status') {
      try {
        const sRes = await new Promise((resolve, reject) => {
          https.get(`https://api.github.com/repos/${GH_REPO}/actions/runs?per_page=5`,
            { headers: { 'Authorization': `token ${GH_TOKEN}`, 'User-Agent': 'ARES' } },
            res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
        });
        let txt = ' *Recent Scans:*\n\n';
        (sRes.workflow_runs || []).forEach(r => {
          const icon = r.status === 'completed' ? (r.conclusion === 'success' ? '' : '') : '';
          txt += `${icon} ${r.conclusion || r.status}\n`;
        });
        if (!sRes.workflow_runs?.length) txt += 'No recent scans.';
        await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: txt, parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }});
      } catch (e) {
        await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: ' Could not fetch status', 
          reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }});
      }
      return { statusCode: 200, body: 'OK' };
    }

    // RECEIVED TARGET - trigger scan
    if (text && !text.startsWith('/') && !text.startsWith('_')) {
      const target = text.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
      const result = await triggerWorkflow('all', target);
      
      await tg('sendMessage', { chat_id: chatId,
        text: result.ok 
          ? ` *Scan Started!*\n\n Target: \`${target}\`\n\n [View on GitHub](https://github.com/${GH_REPO}/actions)` 
          : result.msg,
        parse_mode: 'Markdown', 
        reply_markup: { inline_keyboard: [[{ text: ' New Scan', callback_data: 'menu' }]] }
      });
      return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 200, body: 'OK' };
  } catch (e) { console.error(e); return { statusCode: 200, body: 'OK' }; }
};