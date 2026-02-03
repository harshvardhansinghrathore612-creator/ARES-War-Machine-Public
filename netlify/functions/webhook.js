const https = require('https');

// All tools with names and dependencies
const TOOLS = [
  { id: 'subfinder', name: ' Subfinder', cat: 'Recon', needs: [] },
  { id: 'amass', name: ' Amass', cat: 'Recon', needs: [] },
  { id: 'httpx', name: ' HTTPX', cat: 'Probe', needs: [0] },
  { id: 'naabu', name: ' Naabu', cat: 'Ports', needs: [] },
  { id: 'paramspider', name: ' ParamSpider', cat: 'Params', needs: [] },
  { id: 'arjun', name: ' Arjun', cat: 'Params', needs: [] },
  { id: 'nuclei', name: ' Nuclei', cat: 'Scan', needs: [2] },
  { id: 'nikto', name: ' Nikto', cat: 'Scan', needs: [] },
  { id: 'dalfox', name: ' Dalfox', cat: 'XSS', needs: [4] },
  { id: 'xsstrike', name: ' XSStrike', cat: 'XSS', needs: [4] },
  { id: 'sqlmap', name: '💾 SQLMap', cat: 'SQLi', needs: [4] },
  { id: 'ghauri', name: '🔥 Ghauri', cat: 'SQLi', needs: [4] },
  { id: 'ssrfmap', name: ' SSRFmap', cat: 'SSRF', needs: [4] },
  { id: 'lfimap', name: ' LFImap', cat: 'LFI', needs: [4] },
  { id: 'openredirex', name: ' OpenRedireX', cat: 'Redirect', needs: [4] },
  { id: 'crlfuzz', name: ' CRLFuzz', cat: 'CRLF', needs: [] },
  { id: 'commix', name: ' Commix', cat: 'CMDi', needs: [4] },
  { id: 'tplmap', name: ' Tplmap', cat: 'SSTI', needs: [4] },
  { id: 'subzy', name: ' Subzy', cat: 'Takeover', needs: [0] },
  { id: 'ffuf', name: ' FFUF', cat: 'Fuzz', needs: [] },
  { id: 'feroxbuster', name: ' Feroxbuster', cat: 'Fuzz', needs: [] },
  { id: 'gitleaks', name: ' Gitleaks', cat: 'Secrets', needs: [] }
];

function tg(method, data) {
  return new Promise(r => {
    const body = JSON.stringify(data);
    const req = https.request({ hostname: 'api.telegram.org', path: `/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

async function triggerWorkflow(tools, target) {
  const body = JSON.stringify({ ref: 'main', inputs: { scan_type: tools, target } });
  return new Promise(r => {
    const req = https.request({ hostname: 'api.github.com', path: `/repos/${process.env.GITHUB_REPO}/actions/workflows/ares.yml/dispatches`, method: 'POST',
      headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'ARES' }
    }, res => r(res.statusCode === 204));
    req.write(body); req.end();
  });
}

function buildToolsKeyboard(mask) {
  const kb = [];
  let row = [];
  TOOLS.forEach((t, i) => {
    const sel = (mask & (1 << i)) ? '' : '';
    row.push({ text: `${sel} ${t.name.split(' ')[1]}`, callback_data: `t:${mask ^ (1 << i)}` });
    if (row.length === 3) { kb.push(row); row = []; }
  });
  if (row.length) kb.push(row);
  const count = TOOLS.filter((_, i) => mask & (1 << i)).length;
  kb.push([{ text: ' Select All', callback_data: `t:${(1 << TOOLS.length) - 1}` }, { text: ' Clear', callback_data: 't:0' }]);
  kb.push([{ text: ` START SCAN (${count} tools)`, callback_data: `go:${mask}` }]);
  kb.push([{ text: ' Back', callback_data: 'menu' }]);
  return kb;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') return { statusCode: 200, body: 'ARES Bot Running!' };
    const update = JSON.parse(event.body);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const msgId = update.callback_query?.message?.message_id;
    const text = update.message?.text || '';
    const data = update.callback_query?.data || '';
    
    if (update.callback_query) await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });

    // MAIN MENU
    if (text === '/start' || data === 'menu') {
      await tg('sendMessage', { chat_id: chatId, text: ' *ARES Vulnerability Scanner*\n\nSelect an option:', parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: ' FULL SCAN (All Tools)', callback_data: 'full' }],
          [{ text: ' SELECT TOOLS', callback_data: 't:0' }],
          [{ text: ' MULTI-URL SCAN', callback_data: 'multi' }],
          [{ text: ' Check Status', callback_data: 'status' }]
        ]}
      });
      return { statusCode: 200, body: 'OK' };
    }

    // TOOL SELECTION
    if (data.startsWith('t:')) {
      const mask = parseInt(data.split(':')[1]) || 0;
      const count = TOOLS.filter((_, i) => mask & (1 << i)).length;
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, 
        text: ` *Select Tools* (${count} selected)\n\nTap to toggle:`, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buildToolsKeyboard(mask) }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // START SCAN - check deps and ask for target
    if (data.startsWith('go:')) {
      let mask = parseInt(data.split(':')[1]) || 0;
      if (mask === 0) {
        await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: ' Select at least one tool!',
          reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 't:0' }]] }});
        return { statusCode: 200, body: 'OK' };
      }
      // Auto-add dependencies
      TOOLS.forEach((t, i) => { if (mask & (1 << i)) t.needs.forEach(d => mask |= (1 << d)); });
      const selectedTools = TOOLS.filter((_, i) => mask & (1 << i)).map(t => t.id).join(',');
      const selectedNames = TOOLS.filter((_, i) => mask & (1 << i)).map(t => t.name).join('\n');
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ` *Selected Tools:*\n${selectedNames}\n\n *Send target domain or URL:*\nExample: \`example.com\` or \`https://site.com/page?id=1\``,
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: `t:${mask}` }]] }
      });
      await tg('sendMessage', { chat_id: chatId, text: `TOOLS:${selectedTools}`, parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    // FULL SCAN
    if (data === 'full') {
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ' *FULL SCAN* - All 22 tools\n\n *Send target domain:*\nExample: `example.com`', parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      await tg('sendMessage', { chat_id: chatId, text: 'TOOLS:all' });
      return { statusCode: 200, body: 'OK' };
    }

    // MULTI-URL
    if (data === 'multi') {
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ' *Multi-URL Scan*\n\nSend multiple targets, one per line:\n```\nexample.com\ntarget.org\ntest.com\n```\n\nSend /done when finished.', parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      await tg('sendMessage', { chat_id: chatId, text: 'MODE:multi\nTOOLS:all' });
      return { statusCode: 200, body: 'OK' };
    }

    // STATUS
    if (data === 'status') {
      const sRes = await new Promise(r => {
        https.get(`https://api.github.com/repos/${process.env.GITHUB_REPO}/actions/runs?per_page=5`,
          { headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'ARES' } },
          res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); });
      });
      let txt = ' *Recent Scans:*\n\n';
      (sRes.workflow_runs || []).forEach(r => {
        const icon = r.status === 'completed' ? (r.conclusion === 'success' ? '' : '') : '';
        txt += `${icon} ${r.conclusion || r.status}\n`;
      });
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: txt, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }});
      return { statusCode: 200, body: 'OK' };
    }

    // RECEIVED TARGET
    if (text && !text.startsWith('/') && !text.startsWith('TOOLS:') && !text.startsWith('MODE:')) {
      const target = text.trim();
      const ok = await triggerWorkflow('all', target.replace(/^https?:\/\//, '').split('/')[0]);
      await tg('sendMessage', { chat_id: chatId,
        text: ok ? ` *Scan Started!*\n\n Target: \`${target}\`\n\n https://github.com/${process.env.GITHUB_REPO}/actions` : ' Failed. Check GitHub token.',
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: ' New Scan', callback_data: 'menu' }]] }
      });
      return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 200, body: 'OK' };
  } catch (e) { console.error(e); return { statusCode: 200, body: 'OK' }; }
};