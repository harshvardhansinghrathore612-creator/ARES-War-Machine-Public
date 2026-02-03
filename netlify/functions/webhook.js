const https = require('https');

const TOOLS = ['subfinder','amass','httpx','naabu','paramspider','nuclei','dalfox','xsstrike','sqlmap','ghauri','ssrfmap','lfimap','openredirex','crlfuzz','commix','tplmap','subzy','ffuf','feroxbuster','gitleaks'];

function telegram(method, data) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

async function triggerWorkflow(tools, target) {
  const body = JSON.stringify({ ref: 'main', inputs: { scan_type: tools, target } });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${process.env.GITHUB_REPO}/actions/workflows/ares.yml/dispatches`,
      method: 'POST',
      headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'ARES' }
    }, res => resolve(res.statusCode === 204));
    req.write(body); req.end();
  });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') return { statusCode: 200, body: 'ARES Bot Running!' };
    const update = JSON.parse(event.body);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const msgId = update.callback_query?.message?.message_id;
    const text = update.message?.text || '';
    const data = update.callback_query?.data || '';

    if (update.callback_query) await telegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });

    // MAIN MENU
    if (text === '/start' || data === 'menu') {
      await telegram('sendMessage', {
        chat_id: chatId,
        text: ' *ARES Vulnerability Scanner*\n\nChoose scan type:',
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: ' FULL SCAN (All 20 Tools)', callback_data: 'full' }],
          [{ text: ' QUICK SCAN (Top 5)', callback_data: 'quick' }],
          [{ text: ' RECON ONLY', callback_data: 'recon' }],
          [{ text: ' XSS + SQLi', callback_data: 'xss_sql' }],
          [{ text: ' Check Status', callback_data: 'status' }]
        ]}
      });
      return { statusCode: 200, body: 'OK' };
    }

    // SCAN TYPE SELECTED - ASK FOR TARGET
    if (['full','quick','recon','xss_sql'].includes(data)) {
      const toolSets = {
        full: TOOLS.join(','),
        quick: 'subfinder,httpx,nuclei,dalfox,sqlmap',
        recon: 'subfinder,amass,httpx,naabu',
        xss_sql: 'paramspider,dalfox,xsstrike,sqlmap,ghauri'
      };
      const names = { full: 'Full Scan (20 tools)', quick: 'Quick Scan (5 tools)', recon: 'Recon Only', xss_sql: 'XSS + SQLi' };
      
      await telegram('editMessageText', {
        chat_id: chatId, message_id: msgId,
        text: ` *${names[data]}*\n\nNow send me the target:\n\n Domain: \`example.com\`\n URL: \`https://example.com/page\`\n With params: \`https://example.com?id=1\``,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' Back', callback_data: 'menu' }]] }
      });
      
      // Store tools in a temp way - we'll use the message text to remember
      await telegram('sendMessage', {
        chat_id: chatId,
        text: `🔧 Tools: ${toolSets[data]}\n\n⬆️ Send your target above!`,
        parse_mode: 'Markdown'
      });
      return { statusCode: 200, body: 'OK' };
    }

    // STATUS CHECK
    if (data === 'status') {
      const statusReq = await new Promise((resolve) => {
        https.get(`https://api.github.com/repos/${process.env.GITHUB_REPO}/actions/runs?per_page=3`, 
          { headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'ARES' } },
          res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
      });
      let statusText = ' *Recent Scans:*\n\n';
      (statusReq.workflow_runs || []).forEach(r => {
        const icon = r.status === 'completed' ? (r.conclusion === 'success' ? '' : '') : '';
        statusText += `${icon} ${r.status} - ${r.conclusion || 'running'}\n`;
      });
      await telegram('editMessageText', { chat_id: chatId, message_id: msgId, text: statusText, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu' }]] }});
      return { statusCode: 200, body: 'OK' };
    }

    // RECEIVED TARGET - TRIGGER SCAN
    if (text && !text.startsWith('/')) {
      // Get the last message to find which tools were selected
      const target = text.trim().replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
      
      // Default to full scan if we can't determine
      const ok = await triggerWorkflow('all', target);
      
      await telegram('sendMessage', {
        chat_id: chatId,
        text: ok ? ` *Scan Started!*\n\n Target: \`${target}\`\n Tools: All (20)\n\n [View on GitHub](https://github.com/${process.env.GITHUB_REPO}/actions)` 
                 : ' Failed to start scan. Check GitHub token.',
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: ' New Scan', callback_data: 'menu' }]] }
      });
      return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: 'OK' };
  }
};