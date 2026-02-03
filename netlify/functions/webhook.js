const https = require('https');

// Tools in LOGICAL ORDER (same as full scan)
const TOOLS = [
  { id: 'subfinder', name: ' Subfinder', desc: 'Find subdomains', input: 'domain', output: 'subdomains' },
  { id: 'amass', name: ' Amass', desc: 'Deep subdomain discovery', input: 'domain', output: 'subdomains' },
  { id: 'httpx', name: ' HTTPX', desc: 'Find live hosts', input: 'subdomains', output: 'live_hosts' },
  { id: 'naabu', name: ' Naabu', desc: 'Port scanning', input: 'subdomains', output: 'ports' },
  { id: 'paramspider', name: ' ParamSpider', desc: 'Find parameters', input: 'domain', output: 'params' },
  { id: 'arjun', name: ' Arjun', desc: 'Hidden params', input: 'url', output: 'params' },
  { id: 'nuclei', name: '☢️ Nuclei', desc: 'Vuln templates', input: 'live_hosts', output: 'vulns' },
  { id: 'nikto', name: ' Nikto', desc: 'Web server scan', input: 'url', output: 'vulns' },
  { id: 'ffuf', name: ' FFUF', desc: 'Dir fuzzing', input: 'url', output: 'dirs' },
  { id: 'feroxbuster', name: ' Feroxbuster', desc: 'Recursive discovery', input: 'url', output: 'dirs' },
  { id: 'dalfox', name: ' Dalfox', desc: 'XSS scanner', input: 'params', output: 'xss' },
  { id: 'xsstrike', name: ' XSStrike', desc: 'Advanced XSS', input: 'params', output: 'xss' },
  { id: 'sqlmap', name: ' SQLMap', desc: 'SQL injection', input: 'params', output: 'sqli' },
  { id: 'ghauri', name: ' Ghauri', desc: 'Advanced SQLi', input: 'params', output: 'sqli' },
  { id: 'ssrfmap', name: ' SSRFmap', desc: 'SSRF testing', input: 'params', output: 'ssrf' },
  { id: 'lfimap', name: ' LFImap', desc: 'LFI scanner', input: 'params', output: 'lfi' },
  { id: 'openredirex', name: ' OpenRedireX', desc: 'Open redirect', input: 'params', output: 'redirect' },
  { id: 'crlfuzz', name: ' CRLFuzz', desc: 'CRLF injection', input: 'url', output: 'crlf' },
  { id: 'commix', name: ' Commix', desc: 'Command injection', input: 'params', output: 'cmdi' },
  { id: 'tplmap', name: '📝 Tplmap', desc: 'SSTI scanner', input: 'params', output: 'ssti' },
  { id: 'subzy', name: ' Subzy', desc: 'Subdomain takeover', input: 'subdomains', output: 'takeover' },
  { id: 'gitleaks', name: ' Gitleaks', desc: 'Secret detection', input: 'any', output: 'secrets' }
];

const GH_TOKEN = process.env.GIT_PAT || process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_REPO;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function req(method, host, path, data, headers) {
  return new Promise(r => {
    const body = data ? JSON.stringify(data) : '';
    const opts = { hostname: host, path, method, headers: { 'Content-Type': 'application/json', ...headers } };
    const rq = https.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try { r(JSON.parse(d)); } catch { r({ status: res.statusCode }); } }); });
    if (body) rq.write(body);
    rq.end();
  });
}

const tg = (m, d) => req('POST', 'api.telegram.org', `/bot${TG_TOKEN}/${m}`, d);

async function triggerWorkflow(tool, target) {
  return new Promise(r => {
    const body = JSON.stringify({ ref: 'main', inputs: { scan_type: tool, target } });
    const rq = https.request({ hostname: 'api.github.com', path: `/repos/${GH_REPO}/actions/workflows/ares.yml/dispatches`, method: 'POST',
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'ARES' }
    }, res => r(res.statusCode === 204));
    rq.write(body); rq.end();
  });
}

async function getArtifacts() {
  return req('GET', 'api.github.com', `/repos/${GH_REPO}/actions/artifacts?per_page=100`, null, 
    { 'Authorization': `token ${GH_TOKEN}`, 'User-Agent': 'ARES' });
}

async function deleteArtifact(id) {
  return new Promise(r => {
    https.request({ hostname: 'api.github.com', path: `/repos/${GH_REPO}/actions/artifacts/${id}`, method: 'DELETE',
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'User-Agent': 'ARES' }
    }, res => r(res.statusCode === 204)).end();
  });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') return { statusCode: 200, body: 'ARES OK' };
    const update = JSON.parse(event.body);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const msgId = update.callback_query?.message?.message_id;
    const text = update.message?.text?.trim() || '';
    const data = update.callback_query?.data || '';
    
    if (update.callback_query) await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });

    // 
    // MAIN MENU
    // ═══════════════════════════════
    if (text === '/start' || data === 'menu') {
      await tg('sendMessage', { chat_id: chatId, 
        text: '🛡️ *ARES Scanner*\n\nChoose mode:', parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: '🔥 FULL SCAN (All Tools)', callback_data: 'full' }],
          [{ text: '📋 STEP-BY-STEP (One Tool)', callback_data: 'step' }],
          [{ text: ' DELETE SCAN DATA', callback_data: 'delete' }],
          [{ text: ' Check Status', callback_data: 'status' }]
        ]}
      });
      return { statusCode: 200, body: 'OK' };
    }

    // 
    // FULL SCAN
    // 
    if (data === 'full') {
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ' *FULL SCAN*\n\n Send target domain:', parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      await tg('sendMessage', { chat_id: chatId, text: '_MODE:full_', parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    // 
    // STEP-BY-STEP - Show tools in order
    // 
    if (data === 'step') {
      let toolList = '* Step-by-Step Scan*\n\nTools in logical order:\n\n';
      TOOLS.forEach((t, i) => { toolList += `${i+1}. ${t.name} - ${t.desc}\n`; });
      toolList += '\n_Select a tool to start:_';
      
      const kb = [];
      for (let i = 0; i < TOOLS.length; i += 2) {
        const row = [{ text: `${i+1}. ${TOOLS[i].name.split(' ')[1]}`, callback_data: `tool:${i}` }];
        if (TOOLS[i+1]) row.push({ text: `${i+2}. ${TOOLS[i+1].name.split(' ')[1]}`, callback_data: `tool:${i+1}` });
        kb.push(row);
      }
      kb.push([{ text: ' Back', callback_data: 'menu' }]);
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: toolList, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: kb }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // 
    // TOOL SELECTED - Show what input it needs
    // 
    if (data.startsWith('tool:')) {
      const idx = parseInt(data.split(':')[1]);
      const tool = TOOLS[idx];
      
      let inputMsg = '';
      if (tool.input === 'domain') inputMsg = ' Send target *domain*:\n`example.com`';
      else if (tool.input === 'url') inputMsg = ' Send target *URL*:\n`https://example.com/page`';
      else if (tool.input === 'params') inputMsg = ' Send *URL with parameters*:\n`https://example.com/page?id=1`';
      else if (tool.input === 'subdomains') inputMsg = ' Send *domain* (will use subdomains from previous scan):\n`example.com`';
      else if (tool.input === 'live_hosts') inputMsg = ' Send *domain* (will use live hosts from HTTPX):\n`example.com`';
      else inputMsg = ' Send target:\n`example.com`';
      
      // Show next tool suggestion
      let nextHint = '';
      if (idx < TOOLS.length - 1) {
        const next = TOOLS[idx + 1];
        if (next.input === tool.output || tool.output === 'subdomains' && next.input === 'subdomains') {
          nextHint = `\n\n _After this, you can run ${next.name} using these results_`;
        }
      }
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: `${tool.name}\n\n${inputMsg}${nextHint}`, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'step' }]] }
      });
      await tg('sendMessage', { chat_id: chatId, text: `_TOOL:${tool.id}_`, parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    // 
    // DELETE DATA - List scanned targets
    // 
    if (data === 'delete') {
      const arts = await getArtifacts();
      if (!arts.artifacts?.length) {
        await tg('editMessageText', { chat_id: chatId, message_id: msgId,
          text: ' *No scan data found*\n\nNo artifacts to delete.',
          parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
        });
        return { statusCode: 200, body: 'OK' };
      }
      
      // Group by run/target
      const targets = {};
      arts.artifacts.forEach(a => {
        const key = a.workflow_run?.id || 'unknown';
        if (!targets[key]) targets[key] = { name: a.name, ids: [], size: 0, date: a.created_at };
        targets[key].ids.push(a.id);
        targets[key].size += a.size_in_bytes;
      });
      
      let msg = ' *Delete Scan Data*\n\nSelect to delete:\n\n';
      const kb = [];
      Object.entries(targets).forEach(([key, t]) => {
        const sizeMB = (t.size / 1024 / 1024).toFixed(1);
        const date = new Date(t.date).toLocaleDateString();
        msg += ` ${t.name} (${sizeMB}MB) - ${date}\n`;
        kb.push([{ text: ` ${t.name.slice(0,25)} (${sizeMB}MB)`, callback_data: `del:${t.ids.join(',')}` }]);
      });
      
      kb.push([{ text: ' DELETE ALL', callback_data: `delall:${arts.artifacts.map(a=>a.id).join(',')}` }]);
      kb.push([{ text: ' Back', callback_data: 'menu' }]);
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: msg, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: kb }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // 
    // DELETE SPECIFIC ARTIFACTS
    // 
    if (data.startsWith('del:') || data.startsWith('delall:')) {
      const ids = data.split(':')[1].split(',');
      let deleted = 0;
      for (const id of ids) {
        if (await deleteArtifact(id)) deleted++;
      }
      await tg('editMessageText', { chat_id: chatId, message_id: msgId,
        text: ` Deleted ${deleted} artifact(s)\n\nStorage freed!`, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // 
    // STATUS
    // 
    if (data === 'status') {
      const runs = await req('GET', 'api.github.com', `/repos/${GH_REPO}/actions/runs?per_page=5`, null,
        { 'Authorization': `token ${GH_TOKEN}`, 'User-Agent': 'ARES' });
      
      let txt = ' *Recent Scans:*\n\n';
      (runs.workflow_runs || []).forEach(r => {
        const icon = r.status === 'completed' ? (r.conclusion === 'success' ? '' : '') : '';
        const name = r.display_title || r.name;
        txt += `${icon} ${r.conclusion || r.status} - ${name.slice(0,30)}\n`;
      });
      if (!runs.workflow_runs?.length) txt += 'No recent scans.';
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: txt, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // 
    // RECEIVED TARGET - Start scan directly (no file saving!)
    // 
    if (text && !text.startsWith('/') && !text.startsWith('_')) {
      const target = text.trim();
      const domain = target.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
      
      // Trigger workflow directly with target - NO FILE SAVING
      const ok = await triggerWorkflow('all', domain);
      
      await tg('sendMessage', { chat_id: chatId,
        text: ok 
          ? ` *Scan Started!*\n\n Target: \`${domain}\`\n\n_When complete, you\'ll get results as artifacts._\n\n https://github.com/${GH_REPO}/actions` 
          : ' Failed. Check GIT_PAT token in Netlify.',
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: ' New Scan', callback_data: 'menu' }]] }
      });
      return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 200, body: 'OK' };
  } catch (e) { console.error(e); return { statusCode: 200, body: 'OK' }; }
};