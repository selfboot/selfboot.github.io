from bs4 import BeautifulSoup
import json
import requests

def add_draft():
    access_token = '69_95aldcZUwqN2UdNqHVOhHGkjefk_rlUbKUCHW0Iq828tJ_AsQWOa75j0_JSRYRGd8GHO9CAMm6VSNoU4AQHUqqAS8JGfqhGVWipFz_4FUuyLh3MZWOp4sK2a_0sISBgAGANXG'
    with open('./wechat_demo.html') as f:
        html = f.read()

    title = 'test'
    link = 'https://selfboot.cn' 
    
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

add_draft()