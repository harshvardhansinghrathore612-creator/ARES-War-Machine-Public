import os
import sys
import re
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2 import service_account

def get_drive_service():
    creds = service_account.Credentials.from_service_account_info(
        {
            "type": "service_account",
            "project_id": os.environ["GOOGLE_PROJECT_ID"],
            "private_key_id": os.environ["GOOGLE_PRIVATE_KEY_ID"],
            "private_key": os.environ["GOOGLE_PRIVATE_KEY"].replace('\\n', '\n'),
            "client_email": os.environ["GOOGLE_CLIENT_EMAIL"],
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": os.environ["GOOGLE_CLIENT_X509_CERT_URL"]
        }
    )
    return build('drive', 'v3', credentials=creds)

def process_and_upload(tool_name, input_file):
    if not os.path.exists(input_file):
        print(f"File not found: {input_file}")
        return

    clean_file = input_file.replace(".txt", "_clean.txt")
    if "_log" in input_file:
        clean_file = input_file.replace("_log.txt", ".txt")

    print(f"Processing {tool_name} output from {input_file}...")
    
    findings = []
    with open(input_file, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    if tool_name == "sqlmap":
        # Extract SQLMap findings
        matches = re.finditer(r"(Parameter: .+?)(?=\n\n|\Z)", content, re.DOTALL)
        for m in matches:
            findings.append(m.group(1).strip())
        
        if not findings and "injection not found" not in content:
             # Check for other indicators
             if "Place: " in content:
                 findings.append("Potential vulnerability found (Check logs)")

    elif tool_name == "dalfox":
        # Dalfox standard output is already line-based, but we remove banners
        lines = content.splitlines()
        for line in lines:
            if "[POC]" in line or "[V]" in line:
                findings.append(line.strip())

    elif tool_name == "nuclei":
        # Extract Nuclei findings (already formatted usually, but ensure cleanup)
        lines = content.splitlines()
        for line in lines:
            if "[low]" in line or "[medium]" in line or "[high]" in line or "[critical]" in line:
                findings.append(line.strip())

    else:
        # Default: just copy non-empty lines that aren't banners
        lines = content.splitlines()
        for line in lines:
            if line.strip() and not line.startswith("===") and not line.startswith("[INF]"):
                findings.append(line)

    # Write clean file
    if findings:
        with open(clean_file, 'w', encoding='utf-8') as f:
            f.write("\n".join(findings) + "\n")
        print(f"Cleaned output written to {clean_file} ({len(findings)} findings)")
        
        # Upload
        upload_to_drive(tool_name, clean_file)
    else:
        print("No significant findings to upload.")
        # Create empty placeholder to indicate run finished
        with open(clean_file, 'w') as f: f.write("No vulnerabilities found.\n")
        upload_to_drive(tool_name, clean_file)

def upload_to_drive(tool_name, file_path):
    try:
        service = get_drive_service()
        folder_id = os.environ.get("GDRIVE_FOLDER_ID")
        
        # Create Tool Folder
        q = f"name='ARES_{tool_name}' and '{folder_id}' in parents and mimeType='application/vnd.google-apps.folder'"
        res = service.files().list(q=q).execute().get('files', [])
        if res:
            parent_id = res[0]['id']
        else:
            file_metadata = {
                'name': f"ARES_{tool_name}",
                'mimeType': 'application/vnd.google-apps.folder',
                'parents': [folder_id]
            }
            parent_id = service.files().create(body=file_metadata, fields='id').execute().get('id')

        # Upload File
        file_name = os.path.basename(file_path)
        media = MediaFileUpload(file_path, resumable=True)
        
        # Check existing
        q_file = f"name='{file_name}' and '{parent_id}' in parents and trashed=false"
        res_file = service.files().list(q=q_file).execute().get('files', [])
        
        if res_file:
            service.files().update(fileId=res_file[0]['id'], media_body=media).execute()
            print(f"Updated {file_name} in Drive.")
        else:
            file_metadata = {'name': file_name, 'parents': [parent_id]}
            service.files().create(body=file_metadata, media_body=media, fields='id').execute()
            print(f"Uploaded {file_name} to Drive.")

    except Exception as e:
        print(f"Upload failed: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python process_results.py <tool_name> <input_file>")
        sys.exit(1)
    
    process_and_upload(sys.argv[1], sys.argv[2])
