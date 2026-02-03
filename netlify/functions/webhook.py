"""
ARES Telegram Bot - Netlify Functions Version (FREE FOREVER)
=============================================================
This runs on Netlify's free tier forever!
"""

import os
import json
import requests

# Config
TELEGRAM_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
GITHUB_REPO = os.environ.get('GITHUB_REPO', '')

# Tools
TOOLS = {
    'subfinder': {'name': 'ðŸ” Subfinder', 'needs': []},
    'amass': {'name': 'ðŸ”Ž Amass', 'needs': []},
    'httpx': {'name': 'ðŸŒ HTTPX', 'needs': ['subfinder']},
    'naabu': {'name': 'ðŸ”Œ Naabu', 'needs': []},
    'paramspider': {'name': 'ðŸ•·ï¸ ParamSpider', 'needs': []},
    'arjun': {'name': 'ðŸŽ¯ Arjun', 'needs': []},
    'nuclei': {'name': 'â˜¢ï¸ Nuclei', 'needs': ['httpx']},
    'nikto': {'name': 'ðŸ”¬ Nikto', 'needs': []},
    'ffuf': {'name': 'ðŸ“ FFUF', 'needs': []},
    'feroxbuster': {'name': 'ðŸ¦€ Feroxbuster', 'needs': []},
    'dalfox': {'name': 'ðŸ’‰ Dalfox', 'needs': ['paramspider']},
    'xsstrike': {'name': 'âš¡ XSStrike', 'needs': ['paramspider']},
    'sqlmap': {'name': 'ðŸ’¾ SQLMap', 'needs': ['paramspider']},
    'ghauri': {'name': 'ðŸ”¥ Ghauri', 'needs': ['paramspider']},
    'ssrfmap': {'name': 'ðŸŒ SSRFmap', 'needs': ['paramspider']},
    'lfimap': {'name': 'ðŸ“‚ LFImap', 'needs': ['paramspider']},
    'openredirex': {'name': 'â†ªï¸ OpenRedireX', 'needs': ['paramspider']},
    'crlfuzz': {'name': 'â†©ï¸ CRLFuzz', 'needs': []},
    'commix': {'name': 'ðŸ’€ Commix', 'needs': ['paramspider']},
    'tplmap': {'name': 'ðŸ“ Tplmap', 'needs': ['paramspider']},
    'subzy': {'name': 'ðŸŽ¯ Subzy', 'needs': ['subfinder']},
    'gitleaks': {'name': 'ðŸ” Gitleaks', 'needs': []},
}

# Simple state (resets on cold start - acceptable for serverless)
user_states = {}


def send_telegram(method, data):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/{method}"
    return requests.post(url, json=data, timeout=30)


def send_message(chat_id, text, keyboard=None):
    data = {'chat_id': chat_id, 'text': text, 'parse_mode': 'Markdown'}
    if keyboard:
        data['reply_markup'] = {'inline_keyboard': keyboard}
    return send_telegram('sendMessage', data)


def edit_message(chat_id, message_id, text, keyboard=None):
    data = {'chat_id': chat_id, 'message_id': message_id, 'text': text, 'parse_mode': 'Markdown'}
    if keyboard:
        data['reply_markup'] = {'inline_keyboard': keyboard}
    return send_telegram('editMessageText', data)


def trigger_workflow(tools, target):
    if not GITHUB_TOKEN or not GITHUB_REPO:
        return False, "âŒ GitHub not configured"
    
    url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/ares.yml/dispatches"
    headers = {'Authorization': f'token {GITHUB_TOKEN}', 'Accept': 'application/vnd.github.v3+json'}
    data = {'ref': 'main', 'inputs': {'scan_type': ','.join(tools), 'target': target}}
    
    try:
        r = requests.post(url, headers=headers, json=data, timeout=30)
        return r.status_code == 204, "âœ… Scan started!" if r.status_code == 204 else f"âŒ Error {r.status_code}"
    except Exception as e:
        return False, f"âŒ {e}"


def handle_start(chat_id):
    user_states[chat_id] = {'selected': set(), 'state': 'menu', 'targets': []}
    
    keyboard = [
        [{'text': 'ðŸ”¥ FULL SCAN', 'callback_data': 'full'}],
        [{'text': 'ðŸ“‹ SELECT TOOLS', 'callback_data': 'tools'}],
        [{'text': 'ðŸ“ MULTI-URL', 'callback_data': 'multi'}],
        [{'text': 'ðŸ“Š Status', 'callback_data': 'status'}],
    ]
    
    text = """ðŸ›¡ï¸ *ARES Vulnerability Scanner*

ðŸ”¥ *Full Scan* - All 20+ tools
ðŸ“‹ *Select Tools* - Pick scanners
ðŸ“ *Multi-URL* - Multiple targets
ðŸ“Š *Status* - Check scans"""
    
    send_message(chat_id, text, keyboard)


def handle_tools(chat_id, message_id):
    state = user_states.get(chat_id, {'selected': set()})
    selected = state.get('selected', set())
    
    keyboard = []
    row = []
    for tid, tool in TOOLS.items():
        check = "âœ…" if tid in selected else "â¬œ"
        row.append({'text': f"{check}{tool['name'].split()[0]}", 'callback_data': f't_{tid}'})
        if len(row) == 3:
            keyboard.append(row)
            row = []
    if row:
        keyboard.append(row)
    
    keyboard.append([{'text': 'âœ… All', 'callback_data': 'all'}, {'text': 'âŒ Clear', 'callback_data': 'clear'}])
    keyboard.append([{'text': f'ðŸš€ START ({len(selected)})', 'callback_data': 'go'}])
    keyboard.append([{'text': 'â¬…ï¸ Back', 'callback_data': 'menu'}])
    
    edit_message(chat_id, message_id, f"Select tools ({len(selected)}):", keyboard)


def handle_callback(chat_id, message_id, data):
    state = user_states.setdefault(chat_id, {'selected': set(), 'state': 'menu', 'targets': []})
    
    if data == 'menu':
        handle_start(chat_id)
        return
    
    if data == 'tools':
        state['state'] = 'tools'
        handle_tools(chat_id, message_id)
        return
    
    if data == 'full':
        state['selected'] = set(TOOLS.keys())
        state['state'] = 'waiting_target'
        keyboard = [[{'text': 'â¬…ï¸ Cancel', 'callback_data': 'menu'}]]
        edit_message(chat_id, message_id, "ðŸŒ Enter target domain:", keyboard)
        return
    
    if data == 'multi':
        state['selected'] = set(TOOLS.keys())
        state['state'] = 'waiting_multi'
        state['targets'] = []
        text = "ðŸ“ Send URLs (one per line):\n\n`example.com`\n`https://target.com?id=1`\n\nSend /done when finished."
        keyboard = [[{'text': 'â¬…ï¸ Cancel', 'callback_data': 'menu'}]]
        edit_message(chat_id, message_id, text, keyboard)
        return
    
    if data == 'status':
        if not GITHUB_TOKEN or not GITHUB_REPO:
            edit_message(chat_id, message_id, "âŒ GitHub not configured")
            return
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs?per_page=5"
            r = requests.get(url, headers={'Authorization': f'token {GITHUB_TOKEN}'}, timeout=30)
            runs = r.json().get('workflow_runs', [])
            text = "ðŸ“Š *Recent:*\n\n"
            for run in runs[:5]:
                e = {'completed': 'âœ…', 'in_progress': 'ðŸ”„', 'failure': 'âŒ'}.get(run['status'], 'â“')
                text += f"{e} {run.get('conclusion', run['status'])}\n"
            keyboard = [[{'text': 'â¬…ï¸ Back', 'callback_data': 'menu'}]]
            edit_message(chat_id, message_id, text, keyboard)
        except:
            edit_message(chat_id, message_id, "âŒ Error")
        return
    
    if data == 'all':
        state['selected'] = set(TOOLS.keys())
        handle_tools(chat_id, message_id)
        return
    
    if data == 'clear':
        state['selected'] = set()
        handle_tools(chat_id, message_id)
        return
    
    if data.startswith('t_'):
        tid = data[2:]
        selected = state.get('selected', set())
        if tid in selected:
            selected.discard(tid)
        else:
            selected.add(tid)
        state['selected'] = selected
        handle_tools(chat_id, message_id)
        return
    
    if data == 'go':
        selected = state.get('selected', set())
        if not selected:
            edit_message(chat_id, message_id, "âŒ Select tools first!")
            return
        
        # Auto-add dependencies
        for t in list(selected):
            for dep in TOOLS.get(t, {}).get('needs', []):
                selected.add(dep)
        state['selected'] = selected
        
        state['state'] = 'waiting_target'
        keyboard = [[{'text': 'â¬…ï¸ Cancel', 'callback_data': 'menu'}]]
        edit_message(chat_id, message_id, f"ðŸŒ Enter target ({len(selected)} tools):", keyboard)


def handle_text(chat_id, text):
    state = user_states.get(chat_id, {'state': 'menu'})
    
    if text == '/start':
        handle_start(chat_id)
        return
    
    if state.get('state') == 'waiting_target':
        target = text.strip().replace('https://', '').replace('http://', '').split('/')[0]
        selected = list(state.get('selected', set())) or list(TOOLS.keys())
        
        ok, msg = trigger_workflow(selected, target)
        keyboard = [[{'text': 'ðŸ”„ New Scan', 'callback_data': 'menu'}]]
        send_message(chat_id, f"{msg}\nðŸŽ¯ {target}\nðŸ”§ {len(selected)} tools\n\nðŸ”— https://github.com/{GITHUB_REPO}/actions", keyboard)
        state['state'] = 'menu'
        return
    
    if state.get('state') == 'waiting_multi':
        if text == '/done':
            targets = state.get('targets', [])
            if not targets:
                send_message(chat_id, "âŒ No targets! Send URLs first.")
                return
            
            selected = list(state.get('selected', set())) or list(TOOLS.keys())
            results = []
            for target in targets:
                t = target.strip()
                if not t.startswith('http'):
                    t = t.replace('https://', '').replace('http://', '').split('/')[0]
                ok, _ = trigger_workflow(selected, t)
                results.append(f"{'âœ…' if ok else 'âŒ'} {t[:25]}")
            
            keyboard = [[{'text': 'ðŸ”„ New Scan', 'callback_data': 'menu'}]]
            send_message(chat_id, f"ðŸ“‹ *Started {len(targets)} scans:*\n\n" + "\n".join(results), keyboard)
            state['state'] = 'menu'
            state['targets'] = []
        else:
            urls = [u.strip() for u in text.split('\n') if u.strip()]
            state.setdefault('targets', []).extend(urls)
            send_message(chat_id, f"âœ… Added {len(urls)}. Total: {len(state['targets'])}\n\nSend more or /done")
        return
    
    handle_start(chat_id)


def handler(event, context):
    """Netlify serverless function handler"""
    try:
        body = event.get('body', '{}')
        if isinstance(body, str):
            update = json.loads(body)
        else:
            update = body
        
        if 'message' in update:
            msg = update['message']
            chat_id = msg['chat']['id']
            text = msg.get('text', '')
            handle_text(chat_id, text)
        
        elif 'callback_query' in update:
            cb = update['callback_query']
            chat_id = cb['message']['chat']['id']
            message_id = cb['message']['message_id']
            data = cb.get('data', '')
            send_telegram('answerCallbackQuery', {'callback_query_id': cb['id']})
            handle_callback(chat_id, message_id, data)
        
        return {'statusCode': 200, 'body': 'OK'}
        
    except Exception as e:
        print(f"Error: {e}")
        return {'statusCode': 200, 'body': 'OK'}
