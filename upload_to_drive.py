#!/usr/bin/env python3
import os, sys, glob

def upload():
    tool = os.environ.get("TOOL", "unknown")
    target = os.environ.get("SAFE_TARGET", "target")
    
    # Get credentials
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN")
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    
    if not all([refresh_token, client_id, client_secret, folder_id]):
        print("Drive credentials not configured - skipping upload")
        return
    
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
        
        creds = Credentials(
            None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret
        )
        service = build("drive", "v3", credentials=creds)
        
        # Find or create TARGET folder
        q = f"name='{target}' and '{folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        res = service.files().list(q=q, fields="files(id)").execute().get("files", [])
        if res:
            target_folder_id = res[0]["id"]
        else:
            target_folder_id = service.files().create(
                body={"name": target, "parents": [folder_id], "mimeType": "application/vnd.google-apps.folder"}
            ).execute()["id"]
        
        # Find or create TOOL folder inside target folder
        q = f"name='{tool}' and '{target_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        res = service.files().list(q=q, fields="files(id)").execute().get("files", [])
        if res:
            tool_folder_id = res[0]["id"]
        else:
            tool_folder_id = service.files().create(
                body={"name": tool, "parents": [target_folder_id], "mimeType": "application/vnd.google-apps.folder"}
            ).execute()["id"]
        
        # ONLY upload files for THIS tool - based on tool name
        tool_output_map = {
            "subfinder": ["output/recon/all_subs.txt", "output/recon/subfinder.txt"],
            "amass": ["output/recon/amass.txt"],
            "httpx": ["output/probe/live.txt", "output/probe/httpx.txt"],
            "naabu": ["output/ports/naabu.txt"],
            "paramspider": ["output/crawl/param_urls.txt"],
            "arjun": ["output/crawl/arjun.txt"],
            "nuclei": ["output/vulns/nuclei.txt"],
            "nikto": ["output/vulns/nikto.txt"],
            "ffuf": ["output/vulns/ffuf.txt"],
            "feroxbuster": ["output/vulns/feroxbuster.txt"],
            "dalfox": ["output/xss/dalfox.txt"],
            "xsstrike": ["output/xss/xsstrike.txt"],
            "sqlmap": ["output/sql/sqlmap.txt"],
            "ghauri": ["output/sql/ghauri.txt"],
            "ssrfmap": ["output/ssrf/ssrfmap.txt"],
            "lfimap": ["output/lfi/lfimap.txt"],
            "openredirex": ["output/redirect/openredirex.txt"],
            "crlfuzz": ["output/crlf/crlfuzz.txt"],
            "commix": ["output/cmdi/commix.txt"],
            "tplmap": ["output/ssti/tplmap.txt"],
            "subzy": ["output/takeover/subzy.txt"],
            "gitleaks": ["output/secrets/gitleaks.txt"]
        }
        
        files_to_upload = tool_output_map.get(tool, [])
        uploaded = 0
        
        for file_path in files_to_upload:
            if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                file_name = os.path.basename(file_path)
                media = MediaFileUpload(file_path)
                service.files().create(
                    body={"name": file_name, "parents": [tool_folder_id]},
                    media_body=media
                ).execute()
                print(f"Uploaded: {file_name}")
                uploaded += 1
        
        if uploaded == 0:
            print(f"No results to upload for {tool}")
        else:
            print(f"Uploaded {uploaded} file(s) for {tool}")
            
    except Exception as e:
        print(f"Upload error: {e}")

if __name__ == "__main__":
    upload()
