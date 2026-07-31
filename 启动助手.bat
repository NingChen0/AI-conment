@echo off
chcp 65001 >nul
cd /d %~dp0
title AI 评论助手

echo ================================
echo   🤖 AI 评论助手 启动中...
echo ================================
echo.
echo 正在启动服务器...
echo 请稍候，浏览器将自动打开...
echo.

start http://localhost:3000

node server.js
