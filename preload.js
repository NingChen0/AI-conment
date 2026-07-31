// preload.js
// 无边框窗口：在渲染进程注入最小化的窗口控制 API，供前端自绘标题栏按钮调用。
// 严格隔离：只暴露三个方法，不把 ipcRenderer / require 泄露给页面。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('win-control', 'min'),
  toggleMaximize: () => ipcRenderer.send('win-control', 'max'),
  close: () => ipcRenderer.send('win-control', 'close'),
});
