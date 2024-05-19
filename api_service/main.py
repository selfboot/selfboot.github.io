# main.py
from fastapi import FastAPI

app = FastAPI(title="Blog")

# 导入子应用
from stream import stream_app

# 挂载子应用
app.mount("/stream",stream_app) 

