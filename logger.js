// logger.js
// 统一日志：所有内容同时输出到控制台 + 落盘到 logs/ 目录下的日志文件。
// 目录规则与 server.js 的 WORK_DIR / CONFIG_DIR 保持一致：
//   - Electron 打包后（主进程透传 APP_USER_DATA）=> 用户数据目录/logs
//     （安装目录在 Program Files 下只读，日志必须写到用户数据目录）
//   - 开发模式 / 启动助手.bat（Inno Setup 安装）=> 程序所在目录/logs
// 每次进程启动生成一个带时间戳的日志文件，互不覆盖，便于按"每次运行"排查。
const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.APP_USER_DATA
  ? path.join(process.env.APP_USER_DATA, 'logs')
  : path.join(__dirname, 'logs');

fs.mkdirSync(LOG_DIR, { recursive: true });

function pad(n) { return String(n).padStart(2, '0'); }

function stamp(d) {
  d = d || new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fileName(d) {
  d = d || new Date();
  return `run_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.log`;
}

const LOG_FILE = path.join(LOG_DIR, fileName());

// 追加写流；写盘失败只打 stderr，绝不影响主流程
const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
stream.on('error', (e) => { console.error('[logger] 写日志文件失败:', e.message); });

function writeLine(line) {
  try { stream.write(line + '\n'); } catch (e) { /* ignore */ }
}

// 服务自身日志：带 [时间] [级别] 前缀，同时落盘 + 控制台
function log(level, msg) {
  const line = `[${stamp()}] [${level}] ${typeof msg === 'string' ? msg : String(msg)}`;
  writeLine(line);
  if (level === 'ERROR') console.error(line);
  else console.log(line);
}

// 记录子进程（评论脚本）输出：按行拆分，每行加 [平台] 前缀 + 时间戳后落盘
function child(platform, chunk, type) {
  const level = type === 'error' ? 'ERROR' : 'INFO';
  const text = typeof chunk === 'string' ? chunk : String(chunk);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, '');
    if (!line.trim()) continue;
    const stamped = `[${stamp()}] [${level}] [${platform}] ${line}`;
    writeLine(stamped);
    // 同步打到本进程 stdout：bat 模式下能在黑窗口看到，Electron 模式下由主进程转发
    if (level === 'ERROR') console.error(stamped);
    else console.log(stamped);
  }
}

module.exports = {
  logDir: LOG_DIR,
  logFile: LOG_FILE,
  info: (m) => log('INFO', m),
  warn: (m) => log('WARN', m),
  error: (m) => log('ERROR', m),
  child,
};
