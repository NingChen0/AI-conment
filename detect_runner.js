// detect_runner.js
// 检测阶段独立执行入口：由 server.js fork。
// 环境变量：
//   PLATFORM       zhihu | csdn | toutiao | baidu（sohu 不检测）
//   URLS           JSON 文章链接数组
//   USER_DATA_PATH 浏览器用户数据目录（与评论阶段一致，复用登录态）
//   ACCOUNTS       JSON {平台: 手动账号名}，手填账号优先于页面自动识别
const { chromium } = require('patchright');
const { detectArticle } = require('./detect');
const { checkPause } = require('./pauser'); // 支持暂停/继续（与评论脚本一致）

const PLATFORM = process.env.PLATFORM;
let URLS = [];
try { URLS = JSON.parse(process.env.URLS || '[]'); } catch (e) { URLS = []; }
const USER_DATA_PATH = process.env.USER_DATA_PATH;
let ACCOUNTS = {};
try { ACCOUNTS = JSON.parse(process.env.ACCOUNTS || '{}'); } catch (e) { ACCOUNTS = {}; }
const MANUAL_USER = ACCOUNTS[PLATFORM] || '';

function sleep(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise((r) => setTimeout(r, ms));
}

// 判定页面是否已失效（HTTP 404 或软 404 错误页）
async function isInvalid(page, resp) {
  try {
    if (resp && resp.status() === 404) return true;
    return await page.evaluate(() => {
      const title = (document.title || '').trim();
      if (/^404(?:\s|$|[-_|])/i.test(title)) return true;
      const nodes = document.querySelectorAll(
        '.new_404, .error-404, .error-page, .error-container, .notfound, [class*="not-found"], [class*="notfound"]'
      );
      for (const n of nodes) {
        const t = (n.textContent || '').replace(/\s+/g, '');
        if (/内容不存在|文章不存在|页面不存在|作者删除了内容|想找的内容离你而去|已被删除|资源不存在|404/.test(t)) return true;
      }
      return false;
    });
  } catch (e) {
    return false;
  }
}

async function getTitle(page) {
  try { return (await page.title()) || ''; } catch (e) { return ''; }
}

(async () => {
  if (!PLATFORM || !DETECT_SUPPORTED(PLATFORM)) {
    console.log(`@@DETECT_RESULT@@${JSON.stringify({ platform: PLATFORM, results: [], reason: '不支持的平台或搜狐暂不检测' })}`);
    return;
  }
  if (!URLS.length) {
    console.log(`@@DETECT_RESULT@@${JSON.stringify({ platform: PLATFORM, results: [] })}`);
    return;
  }
  if (!USER_DATA_PATH) {
    console.log(`@@DETECT_RESULT@@${JSON.stringify({ platform: PLATFORM, results: [], reason: '缺少 USER_DATA_PATH' })}`);
    return;
  }

  console.log(`===== 开始检测 ${PLATFORM}：共 ${URLS.length} 篇${MANUAL_USER ? '（手填账号：' + MANUAL_USER + '）' : ''} =====`);

  let context;
  const results = [];
  try {
    context = await chromium.launchPersistentContext(USER_DATA_PATH, {
      headless: false,
      viewport: { width: 1100, height: 900 },
    });

    for (const url of URLS) {
      await checkPause();
      const page = await context.newPage();
      try {
        console.log(`检测中：${url}`);
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await sleep(2500, 4500);

        // 先判失效（404/被删），失效就跳过具体检测
        const invalid = await isInvalid(page, resp);
        let r;
        if (invalid) {
          r = { platform: PLATFORM, title: await getTitle(page) || '链接已失效', username: MANUAL_USER || null, commentCount: null, liked: null, collected: null, invalid: true };
          console.log(`⚠ 链接已失效（404/被删），跳过：${url}`);
        } else {
          r = await detectArticle(page, PLATFORM, MANUAL_USER);
          r.invalid = false;
        }

        const likedTxt = r.liked === null ? '未知' : (r.liked ? '✅' : '❌');
        const colTxt = r.collected === null ? '未知' : (r.collected ? '✅' : '❌');
        const cmtTxt = r.commentCount === null ? '未知' : `${r.commentCount}条`;
        console.log(`→ 评论[${cmtTxt}] 点赞[${likedTxt}] 收藏[${colTxt}]${r.username ? ' 账号=' + r.username : ''}${r.error ? ' 错误=' + r.error : ''}`);

        results.push({
          url,
          title: r.title || '',
          username: r.username || '',
          commentCount: r.commentCount,
          liked: r.liked,
          collected: r.collected,
          invalid: !!r.invalid,
          error: r.error || undefined,
        });
      } catch (e) {
        console.log(`❌ 检测失败 ${url}：${e.message}`);
        results.push({ url, title: '', commentCount: null, liked: null, collected: null, invalid: false, error: e.message });
      } finally {
        if (page && !page.isClosed()) await page.close().catch(() => {});
        await sleep(1500, 3000);
      }
    }

    console.log(`===== ${PLATFORM} 检测完成 =====`);
  } catch (e) {
    console.log(`❌ 检测浏览器启动失败：${e.message}`);
  } finally {
    if (context) await context.close().catch(() => {});
  }

  console.log(`@@DETECT_RESULT@@${JSON.stringify({ platform: PLATFORM, results })}`);
  // 兜底：确保检测进程一定退出（即便有 patchright/IPC 残留句柄），否则 server 会一直等子进程退出
  process.exit(0);
})();

function DETECT_SUPPORTED(p) {
  return p === 'zhihu' || p === 'csdn' || p === 'toutiao' || p === 'baidu';
}
