import requests
import os
import json
import io
import re
from PIL import Image
from bs4 import BeautifulSoup
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
app_id = os.getenv('APP_ID')
app_secret = os.getenv('APP_SECRET')
proxy_url = os.getenv('PROXY_URL')
md_files = os.getenv('MD_FILES').split()

gh_pages_pre = 'public'
thumb_media_id = None

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

def replace_image_urls(html_content, access_token):
    # Define a regular expression to match image URLs
    ## pattern = r'src="[^"]*.png"'
    pattern = r'src="([^"]*.(png|webp|gif)(/webp)?)"'

    def process_url(match):
        # Extract the original URL from the match object
        original_url = match.group(1)
        if original_url.endswith('/webp'):
            original_url = original_url[:-5]
        # Process the URL and return the new URL
        new_url = upload_image_to_wechat(access_token, original_url)
        if new_url:
            return f'src="{new_url}"'
        return ""
    
    # Use the re.sub function to replace all image URLs
    new_html = re.sub(pattern, process_url, html_content)
    return new_html

def md_to_valid_html(accesstoken, md_file):
    p = Path(md_file)
    parts = p.stem.split('-')
    # convert file link from source/_posts/2023-05-24-gpt4_teach_option.md to
    # https://selfboot.cn/2023/05/26/gpt4_tutor_english/
    file_path = '/'.join(parts[:3]) + '/' + '-'.join(parts[3:]) + '/'
    # The link should include the year, month, day from the filename and keep '-' in the title
    html_path = Path(gh_pages_pre) / file_path / 'index.html'
    print(html_path)

    if not html_path.exists():
        print(f"{html_path} not exists")
        return None, None, None
    
    with open(html_path, 'r') as f:
        html_content = f.read()
        
    html_content, title = adapt_wechat(html_content)
    html_content = replace_image_urls(html_content, accesstoken)
    with open('test.html', 'w') as f:
        f.write(html_content)

    parts = p.stem.split('-')
    link = "https://selfboot.cn/" + file_path
    return title, link, html_content

def upload_image_to_wechat(access_token, cos_url):
    headers = {'Referer': 'localhost'}
    response = requests.get(cos_url, headers=headers)
    image_file = io.BytesIO(response.content)
    url = f"https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={access_token}"
    image_file.seek(0)
    try:
        image = Image.open(image_file)
    except Exception as e:
        print(f"Failed to open image file {e}")
        return None
    image_type = image.format.lower()
    image_file.seek(0)
    mime_type = 'image/' + image_type if image_type else 'application/octet-stream'
    files = {'media': ('image.' + image_type if image_type else 'file', image_file, mime_type)}
    print(f"media type: {mime_type}")
    global thumb_media_id
    # Add this image to media library
    if not thumb_media_id:
        media_url = f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={access_token}&type=image"
        media_response = requests.post(media_url, files=files)
        media_data = media_response.json()
        if "media_id" in media_data:
            thumb_media_id = media_data["media_id"]
            print(f"Image added to media library {thumb_media_id} successfully.")

    image_file.seek(0) # Reset the file pointer again
    response = requests.post(url, files=files)
    data = response.json()
    print(f"Image uploaded result {data}")
    if "url" in data:
        print("Image uploaded successfully.")
        return data["url"]
    else:
        print(f"Failed to upload image. Error code: {data['errcode']}, Error message: {data['errmsg']}")
        return None

def _del_unsupported_tag(soup):
    h_tags = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    for tag in h_tags:
        del tag['id']
        for a in tag.find_all('a'):
            a.decompose()

    for a_tag in soup.find_all('a'):
        del a_tag['href']     
    return soup

def _fix_list_item(soup):
    list_tags = soup.find_all(['ul', 'ol'])

    for original_list_tag in list_tags:
        new_list_tag = soup.new_tag(original_list_tag.name)
        # new_list_tag.attrs['style'] = "margin-block-start: 1em; margin-block-end: 1em; margin-inline-start: 0px; margin-inline-end: 0px; padding-inline-start: 40px;"
        for li_tag in original_list_tag.find_all('li', recursive=False):
            new_list_tag.append(li_tag)

        original_list_tag.replace_with(new_list_tag)

    return soup

def _add_table_overflow(soup):
    # style="width: 100%; overflow-x: auto; display: block;"
    for table_tag in soup.find_all('table'):
        table_tag.attrs['style'] = "width: 100%; overflow-x: auto; display: block;"
    return soup

def _add_font_size_to_headers(soup):
    # Define the font sizes
    font_sizes = {
        'h1': '2.0em',
        'h2': '1.8em',
        'h3': '1.6em',
        'h4': '1.4em',
        'h5': '1.2em',
        'h6': '1.0em',
    }
    
    # Add the style attribute to each header tag
    for tag_name, font_size in font_sizes.items():
        for tag in soup.find_all(tag_name):
            tag['style'] = f'font-size: {font_size};'
    
    # Return the modified HTML
    return soup

def adapt_wechat(html_content):
    # <div class="post"><h1 class="post-title">神奇 Prompt 让 GPT4 化身英语老师</h1></div>
    soup = BeautifulSoup(html_content, 'html.parser')
    h1_tag = soup.find('h1', class_='post-title')
    title = h1_tag.text if h1_tag and h1_tag.text else "未知标题"
    
    content_soup = soup.find('div', 'post-content')
    if not content_soup:
        print("Failed to find post content.")
        return None, None
    
    new_html = ''.join(str(content) for content in content_soup.contents)
    page_soup = BeautifulSoup(new_html, 'html.parser')

    page_soup = _del_unsupported_tag(page_soup)
    page_soup = _add_font_size_to_headers(page_soup)
    page_soup = _fix_list_item(page_soup)
    page_soup = _add_table_overflow(page_soup)

    page_content = str(page_soup)
    page_content = page_content.rstrip('\n')
    return page_content, title

def add_draft(access_token, filename):
    title, link, html_content = md_to_valid_html(access_token, filename)
    if not html_content:
        print(f"Failed to convert {filename} to html.")
        return None
    
    article = {
        "title": title,
        "author": "SelfBoot",
        "digest": "",
        "content": html_content,
        "content_source_url": link,
        "thumb_media_id": thumb_media_id if thumb_media_id else "9p-m_bFNKi9cDOyUgfbEnqvyl3Rox79zs1DvpLad1ZBQ4q59A5AKCjqiKgk3nyWb",
        "need_open_comment": 0,
        "only_fans_can_comment": 0
    }

    url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={access_token}"
    headers = {'Content-Type': 'application/json'}  # Add this line
    data = json.dumps({"articles": [article]}, ensure_ascii=False).encode('utf-8') 
    response = requests.post(url, data=data, headers=headers)  # Modify this line
    if response and "media_id" in response.json():
        data = response.json()
        print("Draft created successfully.")
        return data["media_id"]
    else:
        print(f"Failed to create draft. Error response: {response}")
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