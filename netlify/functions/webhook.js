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

function tg(method, data) {
  return new Promise(r => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TG_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{r(JSON.parse(d))}catch{r({})} }); });
    req.write(JSON.stringify(data)); req.end();
  });
}

function triggerWorkflow(scanType, target) {
  return new Promise(r => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GH_REPO}/actions/workflows/ares.yml/dispatches`,
      method: 'POST',
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ARES-Bot' }
    }, res => r(res.statusCode === 204));
    req.write(JSON.stringify({ ref: 'main', inputs: { scan_type: scanType, target: target } }));
    req.end();
  });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') return { statusCode: 200, body: 'ARES Bot' };
    
    const update = JSON.parse(event.body);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const msgId = update.callback_query?.message?.message_id;
    const text = update.message?.text?.trim();
    const data = update.callback_query?.data;

    if (!chatId) return { statusCode: 200, body: 'OK' };
    if (update.callback_query) await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });

    // Initialize session
    if (!SESSIONS[chatId]) SESSIONS[chatId] = { step: 'MENU', selected: [], configs: [] };
    const sess = SESSIONS[chatId];

    // --- MENU ---
    if (text === '/start' || data === 'menu') {
      sess.step = 'MENU'; sess.selected = []; sess.configs = [];
      await tg('sendMessage', { chat_id: chatId, text: '🛡️ *ARES Scanner*\n\nChoose Mode:', parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: ' Custom / Multi-Tool Scan', callback_data: 'custom_setup' }],
          [{ text: '🔥 Full Scan (All Tools)', callback_data: 'full_start' }],
          [{ text: ' Delete Data', callback_data: 'delete_menu' }],
          [{ text: ' Status', callback_data: 'status' }]
        ]} 
      });
      return { statusCode: 200, body: 'OK' };
    }

    // --- CUSTOM SETUP: TOOL SELECTION ---
    if (data === 'custom_setup' || data?.startsWith('toggle:')) {
      if (data.startsWith('toggle:')) {
        const id = data.split(':')[1];
        if (sess.selected.includes(id)) sess.selected = sess.selected.filter(x => x !== id);
        else sess.selected.push(id);
      } else {
        sess.selected = []; // Reset on new start
      }
      
      // Build Grid
      const kb = [];
      for (let i = 0; i < TOOLS.length; i += 2) {
        const row = [];
        const t1 = TOOLS[i];
        const mark1 = sess.selected.includes(t1.id) ? '' : '';
        row.push({ text: `${mark1} ${t1.name}`, callback_data: `toggle:${t1.id}` });
        
        if (TOOLS[i+1]) {
          const t2 = TOOLS[i+1];
          const mark2 = sess.selected.includes(t2.id) ? '' : '';
          row.push({ text: `${mark2} ${t2.name}`, callback_data: `toggle:${t2.id}` });
        }
        kb.push(row);
      }
      kb.push([{ text: ` DONE (${sess.selected.length} selected)`, callback_data: 'config_start' }]);
      kb.push([{ text: ' Back', callback_data: 'menu' }]);
      
      const msgText = ' *Select Tools*\n\nTap to select/deselect tools for this session:';
      if (data === 'custom_setup') await tg('sendMessage', { chat_id: chatId, text: msgText, parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
      else await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: msgText, parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
      return { statusCode: 200, body: 'OK' };
    }

    // --- CONFIGURATION WIZARD ---
    if (data === 'config_start') {
      if (sess.selected.length === 0) {
        await tg('sendMessage', { chat_id: chatId, text: ' Please select at least one tool.' });
        return { statusCode: 200, body: 'OK' };
      }
      sess.step = 'CONFIG';
      sess.configIdx = 0;
      sess.configs = [];
      // Ask for first tool
      const tool = TOOLS.find(t => t.id === sess.selected[0]);
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, 
        text: ` *Configure ${tool.name}*\n\n Send Target(s) (comma separated for multiple):\nExample: \`example.com, test.com\``, 
        parse_mode: 'Markdown' 
      });
      return { statusCode: 200, body: 'OK' };
    }

    // Handle User Input for Config
    if (sess.step === 'CONFIG' && text) {
      // Save current config
      const toolId = sess.selected[sess.configIdx];
      const tool = TOOLS.find(t => t.id === toolId);
      
      // Check if user wants to use "Previous" (Simulated by button usually, but here text)
      // If we are past the first tool, we might have offered a choice.
      // Ideally we check if text is "SAME" or new input.
      
      sess.configs.push({ tools: [toolId], target: text });
      
      sess.configIdx++;
      
      if (sess.configIdx >= sess.selected.length) {
        // All done
        sess.step = 'CONFIRM';
        let summary = '* Scan Summary*\n\n';
        sess.configs.forEach((c, i) => {
           const tName = TOOLS.find(t => t.id === c.tools[0]).name;
           summary += `${i+1}. *${tName}*  \`${c.target}\`\n`;
        });
        summary += '\nReady to launch?';
        
        await tg('sendMessage', { chat_id: chatId, text: summary, parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [
            [{ text: ' LAUNCH SCANS', callback_data: 'launch' }],
            [{ text: ' Cancel', callback_data: 'menu' }]
          ]}
        });
      } else {
        // Next tool
        const nextTool = TOOLS.find(t => t.id === sess.selected[sess.configIdx]);
        const prevTarget = sess.configs[sess.configIdx-1].target;
        
        await tg('sendMessage', { chat_id: chatId, 
          text: ` *Configure ${nextTool.name}*\n\nPrevious target: \`${prevTarget}\`\n\nUse same target or enter new?`,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [
            [{ text: 'Use Previous Target', callback_data: 'use_prev' }],
            // User can just type new target
          ]}
        });
      }
      return { statusCode: 200, body: 'OK' };
    }

    // Handle "Use Previous" button config
    if (data === 'use_prev' && sess.step === 'CONFIG') {
        const prevTarget = sess.configs[sess.configIdx-1].target;
        const toolId = sess.selected[sess.configIdx];
        
        // Optimization: If target is same as previous, MERGE into previous config logic?
        // Actually, to reduce workflow runs, we should group by target.
        // But for now, let's just push it.
        sess.configs.push({ tools: [toolId], target: prevTarget });
        sess.configIdx++;
        
        if (sess.configIdx >= sess.selected.length) {
          sess.step = 'CONFIRM';
          let summary = '* Scan Summary*\n\n';
          sess.configs.forEach((c, i) => {
             const tName = TOOLS.find(t => t.id === c.tools[0]).name;
             summary += `${i+1}. *${tName}*  \`${c.target}\`\n`;
          });
          summary += '\nReady to launch?';
          await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: summary, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: ' LAUNCH', callback_data: 'launch' }], [{ text: ' Cancel', callback_data: 'menu' }]] } 
          });
        } else {
           const nextTool = TOOLS.find(t => t.id === sess.selected[sess.configIdx]);
           const prevT = sess.configs[sess.configIdx-1].target;
           await tg('editMessageText', { chat_id: chatId, message_id: msgId, 
             text: ` *Configure ${nextTool.name}*\n\nPrevious: \`${prevT}\`\n\nUse same or type new?`, parse_mode: 'Markdown',
             reply_markup: { inline_keyboard: [[{ text: 'Use Previous', callback_data: 'use_prev' }]] } 
           });
        }
        return { statusCode: 200, body: 'OK' };
    }

    // --- LAUNCH ---
    if (data === 'launch') {
      // Group by target to minimize runs
      const batches = {};
      sess.configs.forEach(c => {
        if (!batches[c.target]) batches[c.target] = [];
        batches[c.target].push(c.tools[0]);
      });
      
      let msg = ' *Launching Scans...*\n';
      // Trigger runs
      for (const [target, tools] of Object.entries(batches)) {
         const toolStr = tools.join(',');
         const ok = await triggerWorkflow(toolStr, target);
         msg += ok ? ` ${target}: ${tools.length} tool(s)\n` : ` ${target}: Failed to start\n`;
      }
      msg += '\n Check progress on GitHub.';
      
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: msg, parse_mode: 'Markdown',
         reply_markup: { inline_keyboard: [[{ text: ' New Scan', callback_data: 'menu' }]] }
      });
      sess.step = 'MENU';
      return { statusCode: 200, body: 'OK' };
    }

    // --- FULL SCAN ---
    if (data === 'full_start') {
      sess.step = 'FULL_TARGET';
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: ' *Full Scan*\n\nEnter Target(s):', parse_mode: 'Markdown' });
      return { statusCode: 200, body: 'OK' };
    }

    if (sess.step === 'FULL_TARGET' && text) {
      const ok = await triggerWorkflow('all', text);
      await tg('sendMessage', { chat_id: chatId, 
        text: ok ? ` *Full Scan Started*\nTarget: \`${text}\`` : ' Failed to start', parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: 'Menu', callback_data: 'menu' }]] }
      });
      sess.step = 'MENU';
      return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: 'OK' };
  }
};