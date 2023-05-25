import requests
import os
import markdown
import json
import yaml
from pathlib import Path
from dotenv import load_dotenv

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
        if 'GITHUB_ACTIONS' not in os.environ:
            print(f"Access token {data['access_token']} retrieved successfully.")
        return data["access_token"], data["expires_in"]
    else:
        print(f"Failed to retrieve access token. Error code: {data['errcode']}, Error message: {data['errmsg']}")
        return None, None

def parse_md_file(md_file):
    p = Path(md_file)
    if not p.exists():
        print(f"{md_file} does not exist.")
        return None

    with open(md_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    title = None
    # Extract and parse the YAML Front Matter
    if lines[0].strip() == '---':
        end = lines.index('---\n', 1)
        front_matter = yaml.safe_load(''.join(lines[1:end]))
        title = front_matter.get('title')
        content = ''.join(lines[end+1:])
    else:
        title = p.stem
        content = ''.join(lines)
    
    html = markdown.markdown(content)
    # convert file link from
    # source/_posts/2023-05-24-gpt4_teach_option.md
    # to
    # https://selfboot.cn/2023/05/24/gpt4_teach_option/
    parts = p.stem.split('-')
    link = "https://selfboot.cn/" + '/'.join(parts) + '/'
    return title, link, html

def add_draft(access_token, filename):
    title, link, html = parse_md_file(filename)
    if not html:
        print(f"Failed to convert {filename} to html.")
        return None
    
    article = {
        "title": title,
        "author": "SelfBoot",
        "digest": "",
        "content": html,
        "content_source_url": link,
        "thumb_media_id": "9p-m_bFNKi9cDOyUgfbEnqvyl3Rox79zs1DvpLad1ZBQ4q59A5AKCjqiKgk3nyWb",
        "need_open_comment": 0,
        "only_fans_can_comment": 0
    }

    url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={access_token}"
    headers = {'Content-Type': 'application/json'}  # Add this line
    data = json.dumps({"articles": [article]}, ensure_ascii=False).encode('utf-8') 
    response = requests.post(url, data=data, headers=headers)  # Modify this line
    data = response.json()
    if "media_id" in data:
        print("Draft created successfully.")
        return data["media_id"]
    else:
        print(f"Failed to create draft. Error code: {data['errcode']}, Error message: {data['errmsg']}")
        return None

def process_add_mdfiles(md_files):
    access_token, expires_in = get_access_token(app_id, app_secret)
    if not access_token:
        print("Failed to retrieve access token.")
        return
    
    if not md_files:
        print("No md files to process.")
        return
    
    for md_file in md_files:
        media_id = add_draft(access_token, md_file)
        if media_id:
            print(media_id)

if __name__ == "__main__":
    process_add_mdfiles(md_files)