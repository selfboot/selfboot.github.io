import requests
import os
from dotenv import load_dotenv
from requests.auth import HTTPProxyAuth

load_dotenv()
app_id = os.getenv('APP_ID')
app_secret = os.getenv('APP_SECRET')
proxy_url = os.getenv('PROXY_URL')
md_files = os.getenv('MD_FILES').split()

proxies = {
  "https": proxy_url
}

def get_access_token(appid, appsecret):
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={appid}&secret={appsecret}"
    response = requests.get(url, proxies=proxies)
    data = response.json()
    if "access_token" in data:
        print("Access token retrieved successfully.")
        return data["access_token"], data["expires_in"]
    else:
        print(f"Failed to retrieve access token. Error code: {data['errcode']}, Error message: {data['errmsg']}")
        return None, None

def add_draft(access_token, filename):
    print("Add Draft", filename)

def process_add_mdfiles(md_files):
    access_token, expires_in = get_access_token(app_id, app_secret)
    if not access_token:
        print("Failed to retrieve access token.")
        return
    
    if not md_files:
        print("No md files to process.")
        return
    
    for md_file in md_files:
        add_draft(access_token, md_file)

if __name__ == "__main__":
    process_add_mdfiles(md_files)