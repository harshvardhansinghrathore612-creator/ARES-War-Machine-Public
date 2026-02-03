const https = require('https');

// GLOBAL STATE (Ephemeral)
const SESSIONS = {};

const TOOLS = [
  { id: 'subfinder', name: 'Subfinder', cat: 'Recon' },
  { id: 'amass', name: 'Amass', cat: 'Recon' },
  { id: 'httpx', name: 'HTTPX', cat: 'Probe' },
  { id: 'naabu', name: 'Naabu', cat: 'Probe' },
  { id: 'paramspider', name: 'ParamSpider', cat: 'Crawl' },
  { id: 'arjun', name: 'Arjun', cat: 'Crawl' },
  { id: 'nuclei', name: 'Nuclei', cat: 'Vuln' },
  { id: 'nikto', name: 'Nikto', cat: 'Vuln' },
  { id: 'ffuf', name: 'FFUF', cat: 'Fuzz' },
  { id: 'feroxbuster', name: 'Ferox', cat: 'Fuzz' },
  { id: 'dalfox', name: 'Dalfox', cat: 'XSS' },
  { id: 'xsstrike', name: 'XSStrike', cat: 'XSS' },
  { id: 'sqlmap', name: 'SQLMap', cat: 'SQL' },
  { id: 'ghauri', name: 'Ghauri', cat: 'SQL' },
  { id: 'ssrfmap', name: 'SSRFmap', cat: 'SSRF' },
  { id: 'lfimap', name: 'LFImap', cat: 'LFI' },
  { id: 'openredirex', name: 'OpenRedireX', cat: 'Redirect' },
  { id: 'crlfuzz', name: 'CRLFuzz', cat: 'CRLF' },
  { id: 'commix', name: 'Commix', cat: 'Cmdi' },
  { id: 'tplmap', name: 'Tplmap', cat: 'SSTI' },
  { id: 'subzy', name: 'Subzy', cat: 'Takeover' },
  { id: 'gitleaks', name: 'Gitleaks', cat: 'Secret' }
];

const GH_TOKEN = process.env.GIT_PAT || process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_REPO;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function req(method, host, path, data, headers = {}) {
  return new Promise(r => {
    const opts = { hostname: host, path, method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'ARES-Bot', ...headers } };
    const rq = https.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{r(JSON.parse(d))}catch{r({status:res.statusCode})} }); });
    if (data) rq.write(JSON.stringify(data));
    rq.end();
  });
}

const tg = (m, d) => req('POST', 'api.telegram.org', `/bot${TG_TOKEN}/${m}`, d);

async function triggerWorkflow(scanType, target) {
  const res = await req('POST', 'api.github.com', `/repos/${GH_REPO}/actions/workflows/ares.yml/dispatches`, 
    { ref: 'main', inputs: { scan_type: scanType, target: target } }, 
    { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' });
  return res && (res.status === 204 || res.statusCode === 204);
}

async function getArtifacts() {
  return req('GET', 'api.github.com', `/repos/${GH_REPO}/actions/artifacts?per_page=50`, null, { 'Authorization': `token ${GH_TOKEN}` });
}

async function deleteArtifact(id) {
  const res = await req('DELETE', 'api.github.com', `/repos/${GH_REPO}/actions/artifacts/${id}`, null, { 'Authorization': `token ${GH_TOKEN}` });
  return res && (res.status === 204 || res.statusCode === 204);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') return { statusCode: 200, body: 'ARES Bot Active' };
    
    const update = JSON.parse(event.body);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const msgId = update.callback_query?.message?.message_id;
    const text = update.message?.text?.trim();
    const data = update.callback_query?.data;

    if (!chatId) return { statusCode: 200, body: 'OK' };
    if (update.callback_query) await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { step: 'MENU', selected: [], configs: [] };
    const sess = SESSIONS[chatId];

    // --- MENU ---
    if (text === '/start' || data === 'menu') {
      sess.step = 'MENU'; sess.selected = []; sess.configs = [];
      await tg('sendMessage', { chat_id: chatId, text: ' *ARES Scanner*\n\nChoose Mode:', parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: ' Custom / Multi-Tool Scan', callback_data: 'custom_setup' }],
          [{ text: ' Full Scan (All Tools)', callback_data: 'full_start' }],
          [{ text: ' Delete Results', callback_data: 'delete_menu' }],
          [{ text: ' Check Status', callback_data: 'status' }]
        ]} 
      });
      return { statusCode: 200, body: 'OK' };
    }

    // --- CUSTOM: SELECTION ---
    if (data === 'custom_setup' || data?.startsWith('toggle:')) {
      if (data.startsWith('toggle:')) {
        const id = data.split(':')[1];
        if (sess.selected.includes(id)) sess.selected = sess.selected.filter(x => x !== id);
        else sess.selected.push(id);
      } else if (data === 'custom_setup') sess.selected = [];
      
      const kb = [];
      for (let i = 0; i < TOOLS.length; i += 2) {
        const row = [];
        const t1 = TOOLS[i];
        row.push({ text: `${sess.selected.includes(t1.id)?'':''} ${t1.name}`, callback_data: `toggle:${t1.id}` });
        if (TOOLS[i+1]) {
          const t2 = TOOLS[i+1];
          row.push({ text: `${sess.selected.includes(t2.id)?'':''} ${t2.name}`, callback_data: `toggle:${t2.id}` });
        }
        kb.push(row);
      }
      kb.push([{ text: ` DONE (${sess.selected.length})`, callback_data: 'config_start' }]);
      kb.push([{ text: ' Back', callback_data: 'menu' }]);
      
      const msgT = ' *Select Tools*';
      if (data === 'custom_setup') await tg('sendMessage', { chat_id: chatId, text: msgT, parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
      else await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: msgT, parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
      return { statusCode: 200, body: 'OK' };
    }

    // --- CONFIG WIZARD ---
    if (data === 'config_start') {
      if (sess.selected.length === 0) return tg('sendMessage', { chat_id: chatId, text: 'Select at least one tool!' });
      sess.step = 'CONFIG'; sess.configIdx = 0; sess.configs = [];
      const t = TOOLS.find(x => x.id === sess.selected[0]);
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: ` *Configure ${t.name}*\n\n Enter Target(s):`, parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    // Config Input Handler
    if (sess.step === 'CONFIG' && (text || data === 'use_prev')) {
      let target = text;
      if (data === 'use_prev') target = sess.configs[sess.configIdx-1].target;
      
      sess.configs.push({ tools: [sess.selected[sess.configIdx]], target });
      sess.configIdx++;
      
      if (sess.configIdx >= sess.selected.length) {
        sess.step = 'CONFIRM';
        let s = '* Summary*\n';
        sess.configs.forEach(c => s += ` ${TOOLS.find(x=>x.id===c.tools[0]).name}: \`${c.target}\`\n`);
        s += '\nStart Scan?';
        await tg(text?'sendMessage':'editMessageText', { chat_id: chatId, message_id: data?msgId:undefined, text: s, parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: ' RUN', callback_data: 'launch' }], [{ text: ' Cancel', callback_data: 'menu' }]] }
        });
      } else {
        const t = TOOLS.find(x => x.id === sess.selected[sess.configIdx]);
        const prev = sess.configs[sess.configIdx-1].target;
        await tg(text?'sendMessage':'editMessageText', { chat_id: chatId, message_id: data?msgId:undefined, 
          text: ` *Configure ${t.name}*\n\nPrev: \`${prev}\`\n\nUse same or new?`, parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: 'Use Previous', callback_data: 'use_prev' }]] }
        });
      }
      return { statusCode: 200, body: 'OK' };
    }

    // --- LAUNCH ---
    if (data === 'launch') {
      sess.step = 'MENU';
      // Group by target
      const groups = {};
      sess.configs.forEach(c => { if(!groups[c.target]) groups[c.target]=[]; groups[c.target].push(c.tools[0]); });
      
      let res = '';
      for (const [t, tools] of Object.entries(groups)) {
         const ok = await triggerWorkflow(tools.join(','), t);
         res += ok ? ` Started: ${tools.join(', ')} on ${t}\n` : ` Failed: ${t}\n`;
      }
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: res || 'No scans started', reply_markup: { inline_keyboard: [[{ text: 'Menu', callback_data: 'menu' }]] } });
      return { statusCode: 200, body: 'OK' };
    }

    // --- DELETE DATA ---
    if (data === 'delete_menu') {
       const list = await getArtifacts();
       if (!list.artifacts || list.artifacts.length === 0) {
         return tg('editMessageText', { chat_id: chatId, message_id: msgId, text: 'No results found.', reply_markup: { inline_keyboard: [[{ text: 'Back', callback_data: 'menu' }]] } });
       }
       const kb = [];
       list.artifacts.slice(0, 10).forEach(a => {
         kb.push([{ text: ` ${a.name} (${(a.size_in_bytes/1e6).toFixed(1)}MB)`, callback_data: `del:${a.id}` }]);
       });
       kb.push([{ text: 'Back', callback_data: 'menu' }]);
       await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: ' *Delete Results*', parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
       return { statusCode: 200, body: 'OK' };
    }

    if (data?.startsWith('del:')) {
      const id = data.split(':')[1];
      const ok = await deleteArtifact(id);
      await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id, text: ok ? 'Deleted!' : 'Error' });
      // Refresh list
      const list = await getArtifacts();
      const kb = [];
      if(list.artifacts) list.artifacts.slice(0, 10).forEach(a => kb.push([{ text: ` ${a.name}`, callback_data: `del:${a.id}` }]));
      kb.push([{ text: 'Back', callback_data: 'menu' }]);
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: ' *Delete Results*', parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
    }

    // --- STATUS ---
    if (data === 'status') {
       const runs = await req('GET', 'api.github.com', `/repos/${GH_REPO}/actions/runs?per_page=5`, null, { 'Authorization': `token ${GH_TOKEN}` });
       let s = ' *Recent Scans*\n\n';
       (runs.workflow_runs || []).forEach(r => {
         const icon = r.status==='completed'?(r.conclusion==='success'?'':''):'';
         s += `${icon} ${r.display_title || r.name}\n`;
       });
       await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: s, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Menu', callback_data: 'menu' }]] } });
    }
    
    // --- FULL SCAN ---
    if (data === 'full_start') {
       sess.step = 'FULL_TARGET';
       await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: ' *Full Scan* - Enter Target:', parse_mode: 'Markdown' });
    }
    if (sess.step === 'FULL_TARGET' && text) {
       await triggerWorkflow('all', text);
       sess.step = 'MENU';
       await tg('sendMessage', { chat_id: chatId, text: ` Started Full Scan on ${text}`, reply_markup: { inline_keyboard: [[{ text: 'Menu', callback_data: 'menu' }]] } });
    }

    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: 'OK' };
  }
};