const https = require('https');

const SESSIONS = {};

// ALL 22 TOOLS RESTORED
const TOOLS = [
  { id: 'subfinder', name: 'Subfinder', cat: 'Recon', out: 'subs' },
  { id: 'amass', name: 'Amass', cat: 'Recon', out: 'subs' },
  { id: 'httpx', name: 'HTTPX', cat: 'Probe', in: 'subs', out: 'live' },
  { id: 'naabu', name: 'Naabu', cat: 'Probe', in: 'subs', out: 'ports' },
  { id: 'paramspider', name: 'ParamSpider', cat: 'Crawl', in: 'live', out: 'params' },
  { id: 'arjun', name: 'Arjun', cat: 'Crawl', in: 'live', out: 'params' },
  { id: 'nuclei', name: 'Nuclei', cat: 'Vuln', in: 'live' },
  { id: 'nikto', name: 'Nikto', cat: 'Vuln', in: 'live' },
  { id: 'ffuf', name: 'FFUF', cat: 'Fuzz', in: 'live' },
  { id: 'feroxbuster', name: 'Ferox', cat: 'Fuzz', in: 'live' },
  { id: 'dalfox', name: 'Dalfox', cat: 'XSS', in: 'params' },
  { id: 'xsstrike', name: 'XSStrike', cat: 'XSS', in: 'params' },
  { id: 'sqlmap', name: 'SQLMap', cat: 'SQL', in: 'params' },
  { id: 'ghauri', name: 'Ghauri', cat: 'SQL', in: 'params' },
  { id: 'ssrfmap', name: 'SSRFmap', cat: 'SSRF', in: 'params' },
  { id: 'lfimap', name: 'LFImap', cat: 'LFI', in: 'params' },
  { id: 'openredirex', name: 'OpenRedireX', cat: 'Redirect', in: 'params' },
  { id: 'crlfuzz', name: 'CRLFuzz', cat: 'CRLF', in: 'live' },
  { id: 'commix', name: 'Commix', cat: 'Cmdi', in: 'params' },
  { id: 'tplmap', name: 'Tplmap', cat: 'SSTI', in: 'params' },
  { id: 'subzy', name: 'Subzy', cat: 'Takeover', in: 'subs' },
  { id: 'gitleaks', name: 'Gitleaks', cat: 'Secret' }
];

const GH_TOKEN = process.env.GIT_PAT || process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_REPO;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function req(method, host, path, data, headers = {}) {
  return new Promise(r => {
    const opts = { hostname: host, path, method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'ARES-Bot', ...headers } };
    const rq = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { r(JSON.parse(d)) } catch { r({ status: res.statusCode }) } }); });
    if (data) rq.write(JSON.stringify(data));
    rq.end();
  });
}

const tg = (m, d) => req('POST', 'api.telegram.org', `/bot${TG_TOKEN}/${m}`, d);

async function triggerWorkflow(scanType, target, prevId) {
  const inputs = { scan_type: scanType, target: target };
  if (prevId) inputs.previous_run_id = prevId.toString();

  const res = await req('POST', 'api.github.com', `/repos/${GH_REPO}/actions/workflows/ares.yml/dispatches`,
    { ref: 'main', inputs },
    { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' });
  return res && (res.status === 204 || res.statusCode === 204);
}

async function getArtifacts() {
  return req('GET', 'api.github.com', `/repos/${GH_REPO}/actions/artifacts?per_page=30`, null, { 'Authorization': `token ${GH_TOKEN}` });
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

    // DEBUG: Log activity to user if error occurs? No, just keep simple.

    if (update.callback_query) await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { step: 'MENU', selected: [], configs: [] };
    const sess = SESSIONS[chatId];

    // --- MENU ---
    if (text === '/start' || data === 'menu') {
      sess.step = 'MENU'; sess.selected = []; sess.configs = [];
      await tg('sendMessage', {
        chat_id: chatId, text: ' *ARES Scanner*\n\nAll Tools Ready.', parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: ' Custom / Chain Scan', callback_data: 'custom_setup' }],
            [{ text: ' Full Scan (All 22)', callback_data: 'full_start' }],
            [{ text: ' Data', callback_data: 'delete_menu' }]
          ]
        }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // --- SELECTION ---
    if (data === 'custom_setup' || data?.startsWith('toggle:')) {
      if (data.startsWith('toggle:')) {
        const id = data.split(':')[1];
        if (sess.selected.includes(id)) sess.selected = sess.selected.filter(x => x !== id);
        else sess.selected.push(id);
      } else sess.selected = [];

      const kb = [];
      for (let i = 0; i < TOOLS.length; i += 2) {
        const row = [];
        const t1 = TOOLS[i];
        row.push({ text: `${sess.selected.includes(t1.id) ? '' : ''} ${t1.name}`, callback_data: `toggle:${t1.id}` });
        if (TOOLS[i + 1]) {
          const t2 = TOOLS[i + 1];
          row.push({ text: `${sess.selected.includes(t2.id) ? '' : ''} ${t2.name}`, callback_data: `toggle:${t2.id}` });
        }
        kb.push(row);
      }
      kb.push([{ text: ` Next (${sess.selected.length})`, callback_data: 'config_start' }]);
      kb.push([{ text: 'Back', callback_data: 'menu' }]);

      await tg(data === 'custom_setup' ? 'sendMessage' : 'editMessageText', {
        chat_id: chatId, message_id: data !== 'custom_setup' ? msgId : undefined,
        text: ' *Select Tools*', parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb }
      });
      return { statusCode: 200, body: 'OK' };
    }

    // --- WIZARD HELPER ---
    async function showWizardStep(cId, mId, idx, page = 0) {
      const t = TOOLS.find(x => x.id === sess.selected[idx]);
      const kb = [];
      let txt = ` *${t.name}*`;

      // Previous Scan Logic
      if (t.in) {
        txt += `\nNeeds: *${t.in}*`;
        const list = await req('GET', 'api.github.com', `/repos/${GH_REPO}/actions/artifacts?per_page=100`, null, { 'Authorization': `token ${GH_TOKEN}` });

        if (list.artifacts) {
          const PAGE_SIZE = 6;
          const allArtifacts = list.artifacts;
          const start = page * PAGE_SIZE;
          const paged = allArtifacts.slice(start, start + PAGE_SIZE);

          if (paged.length > 0) {
            kb.push([{ text: `--- Previous Output (Page ${page + 1}) ---`, callback_data: 'dummy' }]);
            paged.forEach(r => {
              if (r.workflow_run?.id) {
                const size = (r.size_in_bytes / 1024).toFixed(0) + 'KB';
                let label = r.name;
                // Parse domain from new format: TOOL-ID_DOMAIN
                if (r.name.includes('_')) {
                  const parts = r.name.split('_');
                  label = `${parts[1]} (${parts[0].split('-')[0]})`;
                } else {
                  // Clean up old time-based names: "ares-scan-results-" or just use raw
                  label = r.name.replace('ares-scan-results-', 'Run ');
                }
                kb.push([{ text: `ðŸ“Ž ${label} [${size}]`, callback_data: `use_run:${r.workflow_run.id}` }]);
              }
            });

            // Pagination Buttons
            const navRow = [];
            if (page > 0) navRow.push({ text: 'â¬…ï¸ Newer', callback_data: `art_p:${idx}:${page - 1}` });
            if (allArtifacts.length > start + PAGE_SIZE) navRow.push({ text: 'Older âž¡ï¸', callback_data: `art_p:${idx}:${page + 1}` });
            if (navRow.length) kb.push(navRow);
          }
        }
      }

      if (idx > 0) kb.push([{ text: `Use Previous Target`, callback_data: 'use_prev' }]);

      txt += `\n Enter Target OR select option:`;
      await tg(mId ? 'editMessageText' : 'sendMessage', { chat_id: cId, message_id: mId, text: txt, parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
    }

    if (data === 'config_start') {
      if (sess.selected.length === 0) return tg('sendMessage', { chat_id: chatId, text: 'Select tools!' });
      sess.step = 'CONFIG'; sess.configIdx = 0; sess.configs = [];
      await showWizardStep(chatId, msgId, 0, 0);
      return { statusCode: 200, body: 'OK' };
    }

    // PAGINATION HANDLER
    if (data?.startsWith('art_p:')) {
      const parts = data.split(':');
      const idx = parseInt(parts[1]);
      const page = parseInt(parts[2]);
      await showWizardStep(chatId, msgId, idx, page);
      return { statusCode: 200, body: 'OK' };
    }

    // --- CONFIG INPUT ---
    if (sess.step === 'CONFIG' && (text || data?.startsWith('use_'))) {
      const tId = sess.selected[sess.configIdx];
      let target = text;
      let runId = null;

      if (data === 'use_prev') {
        target = sess.configs[sess.configIdx - 1].target;
        runId = sess.configs[sess.configIdx - 1].runId;
      }
      else if (data?.startsWith('use_run:')) {
        runId = data.split(':')[1];
        target = `RUN_${runId}`; // Placeholder
      }

      sess.configs.push({ tools: [tId], target, runId });
      sess.configIdx++;

      if (sess.configIdx >= sess.selected.length) {
        sess.step = 'CONFIRM';
        let s = '* Plan*\n\n';
        sess.configs.forEach(c => {
          const t = TOOLS.find(x => x.id === c.tools[0]);
          s += ` *${t.name}* -> ${c.runId ? `Run:${c.runId}` : `\`${c.target}\``}\n`;
        });
        await tg(data ? 'editMessageText' : 'sendMessage', {
          chat_id: chatId, message_id: data ? msgId : undefined, text: s, parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: ' RUN', callback_data: 'launch' }], [{ text: 'Cancel', callback_data: 'menu' }]] }
        });
      } else {
        await showWizardStep(chatId, data ? msgId : undefined, sess.configIdx, 0);
      }
      return { statusCode: 200, body: 'OK' };
    }

    // --- LAUNCH ---
    if (data === 'launch') {
      sess.step = 'MENU';
      let res = ' *Scans Triggered:*\n\n';
      for (const c of sess.configs) {
        const t = c.tools[0];
        const ok = await triggerWorkflow(t, c.target, c.runId);
        res += ok ? ` ${TOOLS.find(x => x.id === t).name}\n` : ` ${t} (Fail)\n`;
      }
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: res, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Menu', callback_data: 'menu' }]] } });
      return { statusCode: 200, body: 'OK' };
    }

    // --- DELETE / OTHER ---
    if (data === 'delete_menu') {
      const list = await getArtifacts().catch(() => ({}));
      const kb = [];
      if (list.artifacts) list.artifacts.slice(0, 8).forEach(a => kb.push([{ text: ` ${a.name}`, callback_data: `del:${a.id}` }]));
      kb.push([{ text: 'Back', callback_data: 'menu' }]);
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: 'Trash:', reply_markup: { inline_keyboard: kb } });
    }
    if (data?.startsWith('del:')) {
      await deleteArtifact(data.split(':')[1]);
      await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id, text: 'Deleted' });
    }
    if (data === 'full_start') { sess.step = 'FULL_TARGET'; await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: 'Target:' }); }
    if (sess.step === 'FULL_TARGET' && text) { await triggerWorkflow('all', text); sess.step = 'MENU'; await tg('sendMessage', { chat_id: chatId, text: 'Started', reply_markup: { inline_keyboard: [[{ text: 'Menu', callback_data: 'menu' }]] } }); }

    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    console.error(e);
    // EMERGENCY REPORT
    try {
      const update = JSON.parse(event.body);
      const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
      if (chatId) await tg('sendMessage', { chat_id: chatId, text: ` Error: ${e.message}`, parse_mode: 'HTML' });
    } catch (err) { }
    return { statusCode: 200, body: 'OK' };
  }
};
