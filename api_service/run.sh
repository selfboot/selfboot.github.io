#!/bin/bash

# 定义变量
IMAGE_NAME="api_service"
CONTAINER_NAME="api_service"
HOST_PORT=8000
CONTAINER_PORT=8000

# 任何以下命令失败则脚本退出
set -e

# 检查是否提供了参数
if [ $# -eq 0 ]; then
    echo "No arguments provided"
    echo "Usage: ./manage.sh [build|start|stop|restart]"
    exit 1
fi

# 定义函数
build() {
    echo "Building Docker image..."
    docker build -t $IMAGE_NAME .
    echo "Build completed."
}

start() {
    echo "Starting $CONTAINER_NAME..."
    docker run -d --name $CONTAINER_NAME -p $HOST_PORT:$CONTAINER_PORT $IMAGE_NAME
    echo "$CONTAINER_NAME started."
}

stop() {
    echo "Stopping $CONTAINER_NAME..."
    docker stop $CONTAINER_NAME
    docker rm $CONTAINER_NAME
    echo "$CONTAINER_NAME stopped and removed."
}

restart() {
    stop
    start
}

# 根据提供的参数执行对应操作
case "$1" in
    build)   build ;;
    start)   start ;;
    stop)    stop ;;
    restart) restart ;;
    *) echo "Invalid command: $1" ;;
esac
