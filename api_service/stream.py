from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import time
import asyncio

stream_app = FastAPI()

# 设置CORS
origins = [
    "http://localhost:4000",  # 允许本地开发地址访问
    "https://selfboot.cn",    # 允许自定义域名访问
]

stream_app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # 允许的源列表
    allow_credentials=True, # 允许携带cookie
    allow_methods=["*"],    # 允许所有方法（GET, POST, DELETE, etc.）
    allow_headers=["*"],    # 允许所有头部信息
)

message = """小盛律师业务范围:
委托诉讼，法律咨询，文书撰写，专项法律服务，背调，公证，合同修改。
下面是法律普及文章：
1. 劳动合同到期不续签，一张图告诉你这些情况有钱可以拿！
2. 被裁员后的法律指南
3. 夫妻忠诚协议真的有用吗？
"""

# AJAX轮询
@stream_app.get("/polling")
async def polling(cnt: int = 1):
    if cnt >= len(message) or cnt < 0:  # 检查cnt是否有效
        raise HTTPException(status_code=400, detail="Invalid index")
    data = {"message": message[cnt]}
    return JSONResponse(content=data)


# SSE
@stream_app.get("/events")
async def get_events():
    async def event_stream():
        for i in message:
            yield f"data: {i}\n\n"  # 注意数据格式
            await asyncio.sleep(0.1)
        
        yield f"data: END\n\n" 
    return StreamingResponse(event_stream(), media_type="text/event-stream")

# WebSocket
@stream_app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    for i in message:
        await websocket.send_text(f"{i}")
        await asyncio.sleep(0.1) 
    await websocket.close()


# 分块传输
@stream_app.get("/chunked")
async def chunked_transfer():
    async def generate_large_data():
        for i in message:
            yield f"{i}"
            await asyncio.sleep(0.1)
    return StreamingResponse(generate_large_data(), media_type="text/plain")
