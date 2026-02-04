#!/usr/bin/env python3
"""
ARES Telegram Bot - Multi-Select + Multi-URL Controller
========================================================
Control ARES vulnerability scanner with smart tool selection!

Features:
- Multi-tool selection with checkboxes
- Multiple URLs input support
- Smart dependency checking
- 24/7 operation ready

Deployment: Railway, Render, or any VPS
"""

import os
import requests
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes, ConversationHandler

logging.basicConfig(format='%(asctime)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# States
SELECT_TOOLS, WAITING_TARGET, WAITING_MULTI_URLS = range(3)

# Config from environment
TELEGRAM_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
GITHUB_REPO = os.environ.get('GITHUB_REPO', '')

# Tool definitions
TOOLS = {
    'subfinder': {'name': 'ðŸ” Subfinder', 'cat': 'recon', 'input': 'domain', 'needs': [], 'desc': 'Subdomain enumeration'},
    'amass': {'name': 'ðŸ”Ž Amass', 'cat': 'recon', 'input': 'domain', 'needs': [], 'desc': 'Deep subdomain discovery'},
    'httpx': {'name': 'ðŸŒ HTTPX', 'cat': 'probe', 'input': 'domain', 'needs': ['subfinder'], 'desc': 'Live host detection'},
    'naabu': {'name': 'ðŸ”Œ Naabu', 'cat': 'ports', 'input': 'domain', 'needs': [], 'desc': 'Port scanner'},
    'paramspider': {'name': 'ðŸ•·ï¸ ParamSpider', 'cat': 'params', 'input': 'domain', 'needs': [], 'desc': 'Find parameters'},
    'arjun': {'name': 'ðŸŽ¯ Arjun', 'cat': 'params', 'input': 'url', 'needs': [], 'desc': 'Hidden params'},
    'nuclei': {'name': 'â˜¢ï¸ Nuclei', 'cat': 'vuln', 'input': 'url', 'needs': ['httpx'], 'desc': 'Multi-vuln scanner'},
    'nikto': {'name': 'ðŸ”¬ Nikto', 'cat': 'vuln', 'input': 'url', 'needs': [], 'desc': 'Web server scanner'},
    'ffuf': {'name': 'ðŸ“ FFUF', 'cat': 'fuzz', 'input': 'url', 'needs': [], 'desc': 'Directory fuzzer'},
    'feroxbuster': {'name': 'ðŸ¦€ Feroxbuster', 'cat': 'fuzz', 'input': 'url', 'needs': [], 'desc': 'Recursive fuzzer'},
    'dalfox': {'name': 'ðŸ’‰ Dalfox', 'cat': 'xss', 'input': 'params', 'needs': ['paramspider'], 'desc': 'XSS scanner'},
    'xsstrike': {'name': 'âš¡ XSStrike', 'cat': 'xss', 'input': 'params', 'needs': ['paramspider'], 'desc': 'Advanced XSS'},
    'sqlmap': {'name': 'ðŸ’¾ SQLMap', 'cat': 'sqli', 'input': 'params', 'needs': ['paramspider'], 'desc': 'SQL injection'},
    'ghauri': {'name': 'ðŸ”¥ Ghauri', 'cat': 'sqli', 'input': 'params', 'needs': ['paramspider'], 'desc': 'Advanced SQLi'},
    'ssrfmap': {'name': 'ðŸŒ SSRFmap', 'cat': 'ssrf', 'input': 'params', 'needs': ['paramspider'], 'desc': 'SSRF scanner'},
    'lfimap': {'name': 'ðŸ“‚ LFImap', 'cat': 'lfi', 'input': 'params', 'needs': ['paramspider'], 'desc': 'LFI scanner'},
    'openredirex': {'name': 'â†ªï¸ OpenRedireX', 'cat': 'redirect', 'input': 'params', 'needs': ['paramspider'], 'desc': 'Open redirect'},
    'crlfuzz': {'name': 'â†©ï¸ CRLFuzz', 'cat': 'crlf', 'input': 'url', 'needs': [], 'desc': 'CRLF injection'},
    'commix': {'name': 'ðŸ’€ Commix', 'cat': 'cmdi', 'input': 'params', 'needs': ['paramspider'], 'desc': 'Command injection'},
    'tplmap': {'name': 'ðŸ“ Tplmap', 'cat': 'ssti', 'input': 'params', 'needs': ['paramspider'], 'desc': 'SSTI scanner'},
    'subzy': {'name': 'ðŸŽ¯ Subzy', 'cat': 'takeover', 'input': 'domain', 'needs': ['subfinder'], 'desc': 'Subdomain takeover'},
    'gitleaks': {'name': 'ðŸ” Gitleaks', 'cat': 'secrets', 'input': 'domain', 'needs': [], 'desc': 'Secret detection'},
}

CATEGORIES = {
    'ðŸ” Recon': ['subfinder', 'amass'],
    'ðŸŒ Probe': ['httpx', 'naabu'],
    'ðŸ•·ï¸ Params': ['paramspider', 'arjun'],
    'â˜¢ï¸ Scan': ['nuclei', 'nikto'],
    'ðŸ“ Fuzz': ['ffuf', 'feroxbuster'],
    'ðŸ’‰ XSS': ['dalfox', 'xsstrike'],
    'ðŸ’¾ SQLi': ['sqlmap', 'ghauri'],
    'ðŸŒ SSRF/LFI': ['ssrfmap', 'lfimap'],
    'â†ªï¸ Redirect': ['openredirex', 'crlfuzz'],
    'ðŸ’€ Inject': ['commix', 'tplmap'],
    'ðŸŽ¯ Other': ['subzy', 'gitleaks'],
}


def check_deps(selected: set) -> tuple:
    """Check if dependencies are satisfied"""
    missing = {}
    for t in selected:
        for dep in TOOLS.get(t, {}).get('needs', []):
            if dep not in selected:
                missing.setdefault(t, []).append(dep)
    return len(missing) == 0, missing


def get_input_type(selected: set) -> str:
    """Determine what input is needed"""
    has_recon = any(TOOLS.get(t, {}).get('cat') in ['recon', 'params'] for t in selected)
    needs_params = any(TOOLS.get(t, {}).get('input') == 'params' for t in selected)
    has_param_tool = 'paramspider' in selected or 'arjun' in selected
    
    if has_recon:
        return 'domain'
    if needs_params and not has_param_tool:
        return 'param_url'  # Direct URL with params
    return 'url'


def trigger_workflow(tools: list, target: str) -> tuple:
    """Trigger GitHub workflow"""
    if not GITHUB_TOKEN or not GITHUB_REPO:
        return False, "âŒ Set GITHUB_TOKEN and GITHUB_REPO env vars!"
    
    url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/ares.yml/dispatches"
    headers = {'Authorization': f'token {GITHUB_TOKEN}', 'Accept': 'application/vnd.github.v3+json'}
    data = {'ref': 'main', 'inputs': {'scan_type': ','.join(tools), 'target': target}}
    
    try:
        r = requests.post(url, headers=headers, json=data, timeout=30)
        if r.status_code == 204:
            return True, f"âœ… Scan started!\nðŸŽ¯ Target: `{target}`\nðŸ”§ Tools: {len(tools)}"
        return False, f"âŒ Error {r.status_code}"
    except Exception as e:
        return False, f"âŒ {e}"


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Main menu"""
    context.user_data['selected'] = set()
    context.user_data['targets'] = []
    
    keyboard = [
        [InlineKeyboardButton("ðŸ”¥ FULL SCAN", callback_data='full_scan')],
        [InlineKeyboardButton("ðŸ“‹ SELECT TOOLS", callback_data='tools')],
        [InlineKeyboardButton("ðŸ“ MULTI-URL SCAN", callback_data='multi_url')],
        [InlineKeyboardButton("ðŸ“Š Status", callback_data='status')],
    ]
    
    text = """
ðŸ›¡ï¸ *ARES Vulnerability Scanner*

Choose an option:

ðŸ”¥ *Full Scan* - All 20+ tools on one domain
ðŸ“‹ *Select Tools* - Pick specific scanners  
ðŸ“ *Multi-URL* - Scan multiple targets
ðŸ“Š *Status* - Check running scans
    """
    
    if update.message:
        await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
    else:
        await update.callback_query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
    return SELECT_TOOLS


async def show_tools(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show tool selection"""
    query = update.callback_query
    await query.answer()
    
    selected = context.user_data.get('selected', set())
    keyboard = []
    
    for cat, tools in CATEGORIES.items():
        keyboard.append([InlineKeyboardButton(f"â” {cat} â”", callback_data='_')])
        row = []
        for tid in tools:
            check = "âœ…" if tid in selected else "â¬œ"
            name = TOOLS[tid]['name'].split(' ', 1)[1][:10]
            row.append(InlineKeyboardButton(f"{check}{name}", callback_data=f't_{tid}'))
            if len(row) == 2:
                keyboard.append(row)
                row = []
        if row:
            keyboard.append(row)
    
    keyboard.append([
        InlineKeyboardButton("âœ… All", callback_data='all'),
        InlineKeyboardButton("âŒ Clear", callback_data='clear')
    ])
    keyboard.append([InlineKeyboardButton(f"ðŸš€ START ({len(selected)})", callback_data='start_scan')])
    keyboard.append([InlineKeyboardButton("â¬…ï¸ Back", callback_data='menu')])
    
    await query.edit_message_text(f"Select tools ({len(selected)} chosen):", reply_markup=InlineKeyboardMarkup(keyboard))
    return SELECT_TOOLS


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle callbacks"""
    query = update.callback_query
    await query.answer()
    data = query.data
    
    if data in ['_', 'noop']:
        return SELECT_TOOLS
    
    if data == 'menu':
        return await start(update, context)
    
    if data == 'tools':
        return await show_tools(update, context)
    
    if data == 'full_scan':
        context.user_data['selected'] = set(TOOLS.keys())
        keyboard = [[InlineKeyboardButton("â¬…ï¸ Cancel", callback_data='menu')]]
        await query.edit_message_text("ðŸŒ Enter target domain (e.g., `example.com`):", 
                                       reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return WAITING_TARGET
    
    if data == 'multi_url':
        context.user_data['selected'] = set(TOOLS.keys())
        context.user_data['targets'] = []
        keyboard = [[InlineKeyboardButton("â¬…ï¸ Cancel", callback_data='menu')]]
        text = """
ðŸ“ *Multi-URL Scan*

Send me URLs/domains, one per line:

Example:
```
example.com
https://test.com/page?id=1
target.org
```

Send `/done` when finished.
        """
        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return WAITING_MULTI_URLS
    
    if data == 'status':
        return await check_status(update, context, page=1)
    
    if data.startswith('status_p'):
        page = int(data.split('_p')[1])
        return await check_status(update, context, page=page)
    
    if data == 'all':
        context.user_data['selected'] = set(TOOLS.keys())
        return await show_tools(update, context)
    
    if data == 'clear':
        context.user_data['selected'] = set()
        return await show_tools(update, context)
    
    if data.startswith('t_'):
        tid = data[2:]
        selected = context.user_data.get('selected', set())
        if tid in selected:
            selected.discard(tid)
        else:
            selected.add(tid)
        context.user_data['selected'] = selected
        return await show_tools(update, context)
    
    if data == 'start_scan':
        return await confirm_scan(update, context)
    
    if data == 'add_deps':
        selected = context.user_data.get('selected', set())
        _, missing = check_deps(selected)
        for deps in missing.values():
            selected.update(deps)
        context.user_data['selected'] = selected
        return await confirm_scan(update, context)
    
    if data == 'confirm':
        selected = context.user_data.get('selected', set())
        input_type = get_input_type(selected)
        
        if input_type == 'domain':
            prompt = "ðŸŒ Enter domain (e.g., `example.com`):"
        elif input_type == 'param_url':
            prompt = "ðŸ”— Enter URL with params (e.g., `https://site.com/page?id=1`):"
        else:
            prompt = "ðŸ”— Enter URL (e.g., `https://example.com`):"
        
        keyboard = [[InlineKeyboardButton("â¬…ï¸ Cancel", callback_data='menu')]]
        await query.edit_message_text(prompt, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return WAITING_TARGET
    
    return SELECT_TOOLS


async def confirm_scan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Confirm and check dependencies"""
    query = update.callback_query
    selected = context.user_data.get('selected', set())
    
    if not selected:
        keyboard = [[InlineKeyboardButton("â¬…ï¸ Back", callback_data='tools')]]
        await query.edit_message_text("âŒ No tools selected!", reply_markup=InlineKeyboardMarkup(keyboard))
        return SELECT_TOOLS
    
    ok, missing = check_deps(selected)
    
    if not ok:
        text = "âš ï¸ *Missing Dependencies:*\n\n"
        for t, deps in missing.items():
            text += f"â€¢ {TOOLS[t]['name']} needs: {', '.join(TOOLS[d]['name'] for d in deps)}\n"
        keyboard = [
            [InlineKeyboardButton("âœ… Auto-add", callback_data='add_deps')],
            [InlineKeyboardButton("ðŸ“‹ Edit", callback_data='tools')],
        ]
        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return SELECT_TOOLS
    
    text = f"ðŸš€ *Ready!*\n\n{len(selected)} tools selected.\nProceed?"
    keyboard = [
        [InlineKeyboardButton("âœ… Yes", callback_data='confirm')],
        [InlineKeyboardButton("ðŸ“‹ Edit", callback_data='tools')],
    ]
    await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
    return SELECT_TOOLS


async def receive_target(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Process single target"""
    target = update.message.text.strip()
    selected = list(context.user_data.get('selected', set()))
    
    if not selected:
        await update.message.reply_text("âŒ No tools. Use /start")
        return ConversationHandler.END
    
    # Clean target
    input_type = get_input_type(set(selected))
    if input_type == 'domain':
        target = target.replace('https://', '').replace('http://', '').split('/')[0]
    elif input_type == 'param_url' and '?' not in target:
        keyboard = [[InlineKeyboardButton("â¬…ï¸ Menu", callback_data='menu')]]
        await update.message.reply_text("âŒ Need URL with params!\nExample: `https://site.com/page?id=1`",
                                         reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return WAITING_TARGET
    
    await update.message.reply_text(f"â³ Starting {len(selected)} tools on `{target}`...", parse_mode='Markdown')
    
    ok, msg = trigger_workflow(selected, target)
    keyboard = [[InlineKeyboardButton("ðŸ”„ New Scan", callback_data='menu')]]
    await update.message.reply_text(msg + f"\n\nðŸ”— https://github.com/{GITHUB_REPO}/actions",
                                     reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
    return ConversationHandler.END


async def receive_multi_urls(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Collect multiple URLs"""
    text = update.message.text.strip()
    
    if text.lower() == '/done':
        targets = context.user_data.get('targets', [])
        if not targets:
            await update.message.reply_text("âŒ No targets added! Send URLs first.")
            return WAITING_MULTI_URLS
        
        selected = list(context.user_data.get('selected', set()))
        await update.message.reply_text(f"â³ Starting scans on {len(targets)} targets...")
        
        results = []
        for target in targets:
            # Clean target
            if '?' not in target and not target.startswith(('http://', 'https://')):
                target = target.replace('https://', '').replace('http://', '').split('/')[0]
            
            ok, msg = trigger_workflow(selected, target)
            results.append(f"{'âœ…' if ok else 'âŒ'} {target[:30]}")
        
        result_text = "\n".join(results)
        keyboard = [[InlineKeyboardButton("ðŸ”„ New Scan", callback_data='menu')]]
        await update.message.reply_text(f"ðŸ“‹ *Results:*\n\n{result_text}\n\nðŸ”— https://github.com/{GITHUB_REPO}/actions",
                                         reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return ConversationHandler.END
    
    # Add URLs
    urls = [u.strip() for u in text.split('\n') if u.strip()]
    context.user_data.setdefault('targets', []).extend(urls)
    
    total = len(context.user_data['targets'])
    await update.message.reply_text(f"âœ… Added {len(urls)} target(s). Total: {total}\n\nSend more or `/done` to start.")
    return WAITING_MULTI_URLS


async def check_status(update: Update, context: ContextTypes.DEFAULT_TYPE, page: int = 1):
    """Check workflow status with pagination"""
    query = update.callback_query
    
    if not GITHUB_TOKEN or not GITHUB_REPO:
        await query.edit_message_text("âŒ GitHub not configured")
        return SELECT_TOOLS
    
    try:
        per_page = 6
        url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs?per_page={per_page}&page={page}"
        r = requests.get(url, headers={'Authorization': f'token {GITHUB_TOKEN}'}, timeout=30)
        runs = r.json().get('workflow_runs', [])
        
        if runs:
            text = f"ðŸ“Š *Recent Scans (Page {page}):*\n\n"
            for run in runs:
                status_icon = {'completed': 'âœ…', 'in_progress': 'ðŸ”„', 'queued': 'â³', 'failure': 'âŒ', 'cancelled': 'ðŸš«'}.get(run['status'], 'â“')
                conc = run.get('conclusion') or run['status']
                # Use display_title if available, else name. New runs will use 'Tool | Target'
                name = run.get('display_title') or run.get('name', 'Scan')
                # If name is generic 'ARES Scanner', try to find identification (hard for old runs)
                if name == "ARES Scanner": name = "Legacy Scan"
                
                text += f"`{run['id']}` | {name}\n{status_icon} {conc} | {run['created_at'][:16].replace('T', ' ')}\n\n"
        else:
            text = f"No scans found on page {page}."
        
        # Pagination Buttons
        buttons = []
        nav_row = []
        if page > 1:
            nav_row.append(InlineKeyboardButton("â¬…ï¸ Newer", callback_data=f'status_p{page-1}'))
        if len(runs) == per_page:
            nav_row.append(InlineKeyboardButton("Older âž¡ï¸", callback_data=f'status_p{page+1}'))
        
        if nav_row: buttons.append(nav_row)
        buttons.append([InlineKeyboardButton("â¬…ï¸ Back to Menu", callback_data='menu')])
        
        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(buttons), parse_mode='Markdown')
    except Exception as e:
        await query.edit_message_text(f"âŒ Error: {e}")
    
    return SELECT_TOOLS


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("/start to begin")
    return ConversationHandler.END


def main():
    if not TELEGRAM_TOKEN:
        print("=" * 50)
        print("âŒ Set environment variables:")
        print("   TELEGRAM_BOT_TOKEN")
        print("   GITHUB_TOKEN")
        print("   GITHUB_REPO")
        print("=" * 50)
        return
    
    print("ðŸ¤– ARES Bot Starting...")
    print(f"   Repo: {GITHUB_REPO or 'NOT SET'}")
    
    app = Application.builder().token(TELEGRAM_TOKEN).build()
    
    conv = ConversationHandler(
        entry_points=[CommandHandler('start', start), CallbackQueryHandler(handle_callback)],
        states={
            SELECT_TOOLS: [CallbackQueryHandler(handle_callback)],
            WAITING_TARGET: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_target),
                CallbackQueryHandler(handle_callback)
            ],
            WAITING_MULTI_URLS: [
                MessageHandler(filters.TEXT, receive_multi_urls),
                CommandHandler('done', receive_multi_urls),
                CallbackQueryHandler(handle_callback)
            ]
        },
        fallbacks=[CommandHandler('cancel', cancel), CommandHandler('start', start)],
        per_message=False
    )
    
    app.add_handler(conv)
    
    print("âœ… Bot running! Send /start")
    app.run_polling()


if __name__ == '__main__':
    main()
