// pauser.js — 评论脚本的暂停/继续支持
// 评论脚本 require 本模块，在每篇文章循环开头 await checkPause()。
// 进程收到 {cmd:'pause'} 时在下一个检查点阻塞；收到 {cmd:'resume'} 时放行。
// 关键：不重启、不丢进度，从暂停处继续。
let paused = false;
const waiters = [];

if (process.on) {
  process.on('message', (msg) => {
    const cmd = typeof msg === 'string' ? msg : (msg && msg.cmd);
    if (cmd === 'pause') {
      paused = true;
      console.log('⏸️ 已暂停：点「继续」会从当前位置继续（不重启）');
    } else if (cmd === 'resume') {
      paused = false;
      console.log('▶️ 已继续');
      while (waiters.length) waiters.shift()();
    }
  });
  // 注册 'message' 监听会让 fork 的 IPC 通道被 ref，从而阻止进程自然退出（检测完卡住不退）。
  // unref 后：脚本运行期间仍能收到 pause/resume，但活干完时进程能正常退出。
  if (process.channel && typeof process.channel.unref === 'function') {
    process.channel.unref();
  }
}

/** 到达检查点：若处于暂停态则阻塞，直到收到 resume。 */
async function checkPause() {
  while (paused) {
    await new Promise((resolve) => { waiters.push(resolve); });
  }
}

module.exports = { checkPause };
