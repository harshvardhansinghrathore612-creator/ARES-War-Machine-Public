#!/usr/bin/env python3
"""
Run this ONCE after deploying to Netlify to set up the webhook.
"""
import requests
import sys

if len(sys.argv) < 3:
    print("Usage: python setup_webhook.py <BOT_TOKEN> <NETLIFY_URL>")
    print("Example: python setup_webhook.py 123456:ABC https://your-site.netlify.app")
    sys.exit(1)

BOT_TOKEN = sys.argv[1]
NETLIFY_URL = sys.argv[2].rstrip('/')

webhook_url = f"{NETLIFY_URL}/.netlify/functions/webhook"
api_url = f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook"

print(f"Setting webhook to: {webhook_url}")

response = requests.post(api_url, json={'url': webhook_url})
result = response.json()

if result.get('ok'):
    print("âœ… Webhook set successfully!")
    print(f"   Your bot is now live!")
    print(f"   Send /start to your bot on Telegram")
else:
    print(f"âŒ Error: {result}")
