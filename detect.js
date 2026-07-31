// detect.js
// 统一检测模块：在「评论任务全部跑完后」由 detect_runner 调用，逐篇文章回查
//   - 我的评论数（按账号匹配；支持多账号，命中任意一个即计入）
//   - 是否已点赞
//   - 是否已收藏
// 评论数检测移植自 chrome 评论插件（知乎/头条/CSDN 走平台评论 API；百度走 DOM 翻页）。
// 点赞/收藏检测复用各 pinglun_*.js 里已验证过的按钮状态选择器。
// 搜狐（sohu）暂不检测。
//
// 每个 DETECTORS[platform] 都是「自包含」的 async 函数：不引用任何外部变量，
// 只用浏览器全局（fetch / document / location / URL / getComputedStyle …），
// 因此可以直接 page.evaluate(DETECTORS[platform], manualUser) 在页面上下文里执行。
//
// manual 为「手填账号」字符串，可用逗号分隔多个（半角 , / 全角 ， / 顿号 、）。
// 命中其中任意一个就算「我的评论」；手填优先于页面自动识别；都没识别到则评论数=未知。

// ===== 知乎 =====
async function detectZhihu(manual) {
  const clean = (v) => (v || '').replace(/[​-‍⁠﻿]/g, '').replace(/\s+/g, ' ').trim();

  let title = '';
  try {
    title = clean(document.querySelector('meta[property="og:title"]')?.content)
      || clean(document.querySelector('h1')?.textContent)
      || document.title.replace(/\s*[-–]\s*(知乎|Zhihu).*$/i, '').trim();
  } catch (e) { /* ignore */ }

  // ---- 自动识别当前登录用户名（顶部导航，避免把作者当当前用户）----
  let autoUser = null;
  const headerSels = [
    '.AppHeader-profile img[alt]', '.AppHeader-userInfo img[alt]',
    'header button img[alt]', 'header [aria-label*="个人"] img[alt]',
    'header [aria-label*="我的"] img[alt]', '[class*="AppHeader"] [class*="profile"] img[alt]',
  ];
  for (const sel of headerSels) {
    for (const img of document.querySelectorAll(sel)) {
      const alt = clean(img.alt);
      let name = null;
      for (const re of [/^(.+?)的头像$/, /^(.+?)头像$/, /^点击(?:打开|查看)(.+?)(?:的(?:主页|个人资料))?$/]) {
        const m = alt.match(re);
        const n = clean(m && m[1]);
        if (n && n.length < 30) { name = n; break; }
      }
      if (name) { autoUser = name; break; }
    }
    if (autoUser) break;
  }
  if (!autoUser) {
    try {
      const t = document.querySelector('#js-initialData, script[data-state]')?.textContent;
      if (t) {
        const d = JSON.parse(t);
        const a = (d && d.initialState && (d.initialState.account || d.initialState.user)) || d.account;
        const n = clean(a && (a.name || (a.user && a.user.name) || a.displayName));
        if (n && n.length < 30) autoUser = n;
      }
    } catch (e) { /* ignore */ }
  }

  // 匹配账号集：手填（可多个）优先，否则用自动识别的
  // 匹配账号集：手填（可用逗号分隔多个）优先，否则用自动识别的
  const matchSet = [];
  if (manual) {
    const _seen = new Set();
    String(manual).split(/[,，、]/).forEach((s) => { const n = clean(s); if (n && !_seen.has(n)) { _seen.add(n); matchSet.push(n); } });
  }
  if (!matchSet.length && autoUser) matchSet.push(autoUser);
  const isMine = (name) => { const n = clean(name); return !!n && matchSet.indexOf(n) >= 0; };

  // ---- 我的评论数（专栏 /p/ 走评论接口）----
  let commentCount = null;
  const articleId = location.pathname.match(/^\/p\/(\d+)/)?.[1];
  if (articleId && matchSet.length) {
    try {
      const apiPath = `/api/v4/comment_v5/articles/${articleId}/root_comment`;
      let nextUrl = `https://www.zhihu.com${apiPath}?order_by=score&limit=20&offset=`;
      const seenPages = new Set();
      const seenC = new Set();
      let matched = 0;
      let pages = 0;
      while (nextUrl && pages < 50 && !seenPages.has(nextUrl)) {
        const u = new URL(nextUrl);
        if (u.origin !== 'https://www.zhihu.com' || u.pathname !== apiPath) break;
        seenPages.add(nextUrl);
        const res = await fetch(nextUrl, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!res.ok) break;
        const p = await res.json();
        for (const c of (p.data || [])) {
          if (c.is_delete) continue;
          const id = clean(c.id);
          if (id && seenC.has(id)) continue;
          if (id) seenC.add(id);
          if (isMine(c.author && c.author.name)) matched++;
        }
        pages++;
        nextUrl = p.paging && p.paging.is_end ? null : (p.paging && p.paging.next) || null;
      }
      commentCount = matched;
    } catch (e) {
      commentCount = null;
    }
  }

  // ---- 点赞 / 收藏 ----
  let liked = null;
  let collected = null;
  try {
    const likeBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => /^(赞同|已赞同)/.test(clean(b.getAttribute('aria-label'))));
    if (likeBtn) liked = clean(likeBtn.getAttribute('aria-label')).startsWith('已赞同');
  } catch (e) { /* ignore */ }
  try {
    const colBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => { const l = clean(b.getAttribute('aria-label')); return l === '收藏' || l === '已收藏'; });
    if (colBtn) collected = clean(colBtn.getAttribute('aria-label')) === '已收藏';
  } catch (e) { /* ignore */ }

  return { platform: 'zhihu', title, username: matchSet.join(','), commentCount, liked, collected };
}

// ===== CSDN =====
async function detectCsdn(manual) {
  const clean = (v) => (v || '').replace(/[​-‍⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const s = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0;
  };

  let title = '';
  try {
    title = clean(document.querySelector('meta[property="og:title"]')?.content)
      || clean(document.querySelector('h1.title-article, h1.article-title, main h1, h1')?.textContent)
      || document.title.replace(/-CSDN博客\s*$/i, '').trim();
  } catch (e) { /* ignore */ }

  // ---- 自动识别当前登录账号（评论接口用账号 ID，如 m0_56676924；昵称用于兜底匹配）----
  const accountRoot = document.querySelector('.toolbar-btn-login-new, .toolbar-btn-login');
  let userName = '';
  const profileLinks = accountRoot
    ? accountRoot.querySelectorAll('a.hasAvatar[href*="blog.csdn.net/"], a.csdn-profile-avatar[href*="blog.csdn.net/"], a.csdn-img-text-box[href*="blog.csdn.net/"]')
    : [];
  for (const link of profileLinks) {
    try {
      const u = new URL(link.href, location.href);
      if (u.hostname !== 'blog.csdn.net') continue;
      const c = clean(u.pathname.split('/').filter(Boolean)[0]);
      if (c && c !== 'blog') { userName = c; break; }
    } catch (e) { /* ignore */ }
  }
  let nickName = '';
  try {
    const n = clean(accountRoot?.querySelector('.csdn-profile-nickName')?.textContent
      || accountRoot?.querySelector('.csdn-profile-top')?.textContent);
    if (n && !/^(?:[-—–_]{1,}|加载中\.{0,3}|登录|未登录|null|undefined)$/i.test(n)) nickName = n;
  } catch (e) { /* ignore */ }

  // 匹配账号集：手填（可多个）优先，否则用自动识别的 userName + 昵称
  // 匹配账号集：手填（可用逗号分隔多个）优先，否则用自动识别的
  const matchSet = [];
  if (manual) {
    const _seen = new Set();
    String(manual).split(/[,，、]/).forEach((s) => { const n = clean(s); if (n && !_seen.has(n)) { _seen.add(n); matchSet.push(n); } });
  }
  if (!matchSet.length) { if (userName) matchSet.push(userName); if (nickName) matchSet.push(nickName); }
  const isMine = (name) => { const n = clean(name); return !!n && matchSet.indexOf(n) >= 0; };

  // ---- 我的评论数 ----
  let commentCount = null;
  const articleId = location.pathname.match(/\/article\/details\/(\d+)/)?.[1];
  if (articleId && matchSet.length) {
    try {
      const seen = new Set();
      let matched = 0;
      // 递归统计：根评论 + 子回复，按 commentId 去重，匹配 userName 或 nickName
      const countItem = (item) => {
        const info = item.info || {};
        const cid = clean(String(info.commentId == null ? '' : info.commentId));
        let m = 0;
        if (!cid || !seen.has(cid)) {
          if (cid) seen.add(cid);
          if (isMine(info.userName) || isMine(info.nickName)) m++;
        }
        for (const sub of (item.sub || [])) m += countItem(sub);
        return m;
      };
      for (const fold of ['unfold', 'fold']) {
        let page = 1;
        let pageCount = 1;
        while (page <= pageCount && page <= 100) {
          const url = new URL(`/phoenix/web/v1/comment/list/${articleId}`, 'https://blog.csdn.net');
          url.searchParams.set('page', String(page));
          url.searchParams.set('size', '10');
          url.searchParams.set('fold', fold);
          if (page === 1 && fold === 'unfold') url.searchParams.set('commentId', '');
          const res = await fetch(url.toString(), { credentials: 'include', headers: { Accept: 'application/json' } });
          if (!res.ok) break;
          const payload = await res.json();
          if (payload.code !== 200 || !payload.data) break;
          if (page === 1) pageCount = Math.min(100, Math.max(1, Number(payload.data.pageCount) || 1));
          for (const item of (payload.data.list || [])) matched += countItem(item);
          page++;
        }
      }
      commentCount = matched;
    } catch (e) {
      commentCount = null;
    }
  }

  // ---- 点赞 / 收藏 ----
  let liked = null;
  let collected = null;
  const likeActive = document.querySelector('img#is-like-imgactive');
  const likeInactive = document.querySelector('img#is-like-img');
  if (likeActive && isVisible(likeActive)) liked = true;
  else if (likeInactive) liked = false;
  const colActive = document.querySelector('img#is-collection-imgactive');
  const colInactive = document.querySelector('img#is-collection-img');
  if (colActive && isVisible(colActive)) collected = true;
  else if (colInactive) collected = false;

  return { platform: 'csdn', title, username: matchSet.join(','), commentCount, liked, collected };
}

// ===== 今日头条 =====
async function detectToutiao(manual) {
  const clean = (v) => (v || '').replace(/[​-‍⁠﻿]/g, '').replace(/\s+/g, ' ').trim();

  let title = '';
  try {
    title = clean(document.querySelector('meta[property="og:title"]')?.content)
      || clean(document.querySelector('main h1, h1')?.textContent)
      || document.title.replace(/\s*[-–]\s*今日头条\s*$/i, '').trim();
  } catch (e) { /* ignore */ }

  // ---- 自动识别当前登录用户名（顶部账号入口的 aria-label）----
  let autoUser = null;
  const sels = [
    'header a[aria-label][href*="/c/user/token/"]',
    '[role="banner"] a[aria-label][href*="/c/user/token/"]',
    'header a[aria-label][href*="/c/user/"]',
  ];
  for (const sel of sels) {
    for (const link of document.querySelectorAll(sel)) {
      const name = clean(link.getAttribute('aria-label'));
      if (name && name.length <= 60 && !/个人主页|作者头像/.test(name)) { autoUser = name; break; }
    }
    if (autoUser) break;
  }

  // 匹配账号集：手填（可用逗号分隔多个）优先，否则用自动识别的
  const matchSet = [];
  if (manual) {
    const _seen = new Set();
    String(manual).split(/[,，、]/).forEach((s) => { const n = clean(s); if (n && !_seen.has(n)) { _seen.add(n); matchSet.push(n); } });
  }
  if (!matchSet.length && autoUser) matchSet.push(autoUser);
  const isMine = (name) => { const n = clean(name); return !!n && matchSet.indexOf(n) >= 0; };

  // ---- 我的评论数 ----
  let commentCount = null;
  const articleId = location.pathname.match(/^\/article\/(\d+)/)?.[1];
  if (articleId && matchSet.length) {
    try {
      const seenOffsets = new Set();
      const seenC = new Set();
      let offset = 0;
      let matched = 0;
      const countComment = (comment) => {
        if (!comment) return 0;
        let m = 0;
        const cid = clean(comment.id_str || String(comment.id == null ? '' : comment.id));
        if (!cid || !seenC.has(cid)) {
          if (cid) seenC.add(cid);
          if (isMine(comment.user_name)) m++;
        }
        for (const r of (comment.reply_list || [])) m += countComment(r);
        for (const r of (comment.new_reply_list || [])) m += countComment(r);
        return m;
      };
      for (let page = 0; page < 100 && !seenOffsets.has(offset); page++) {
        seenOffsets.add(offset);
        const url = new URL('/article/v4/tab_comments/', 'https://www.toutiao.com');
        url.searchParams.set('aid', '24');
        url.searchParams.set('app_name', 'toutiao_web');
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('count', '20');
        url.searchParams.set('group_id', articleId);
        url.searchParams.set('item_id', articleId);
        const res = await fetch(url.toString(), { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!res.ok) break;
        const payload = await res.json();
        if (payload.err_no !== 0 || payload.message !== 'success') break;
        for (const entry of (payload.data || [])) matched += countComment(entry.comment);
        if (!payload.has_more) break;
        const next = Number(payload.offset);
        if (!Number.isFinite(next) || next <= offset) break;
        offset = next;
      }
      commentCount = matched;
    } catch (e) {
      commentCount = null;
    }
  }

  // ---- 点赞 / 收藏 ----
  let liked = null;
  let collected = null;
  const likeBtn = document.querySelector('div.detail-like[role="button"]');
  if (likeBtn) liked = clean(likeBtn.getAttribute('aria-pressed')) === 'true';
  const colBtn = document.querySelector('div.detail-interaction-collect[role="button"]');
  if (colBtn) collected = clean(colBtn.getAttribute('aria-pressed')) === 'true';

  return { platform: 'toutiao', title, username: matchSet.join(','), commentCount, liked, collected };
}

// ===== 百度百家号 =====
async function detectBaidu(manual) {
  const clean = (v) => (v || '').replace(/[​-‍⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let title = '';
  try {
    title = clean(document.querySelector('meta[property="og:title"]')?.content)
      || clean(document.querySelector('h1')?.textContent) || document.title;
  } catch (e) { /* ignore */ }

  // ---- 自动识别当前登录用户名 ----
  let autoUser = null;
  const accountLinks = document.querySelectorAll(
    'a[href="http://i.baidu.com/"], a[href="https://i.baidu.com/"], header a[href*="i.baidu.com"]',
  );
  for (const link of accountLinks) {
    const name = clean(link.textContent || link.getAttribute('aria-label') || link.getAttribute('title'));
    if (name && name.length <= 60 && !/^(登录|百度首页|个人中心)$/.test(name)) { autoUser = name; break; }
  }
  if (!autoUser) {
    try {
      for (const key of Object.keys(localStorage)) {
        if (!/(user|passport|account|profile)/i.test(key)) continue;
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          const queue = [data];
          const visited = new Set();
          while (queue.length > 0) {
            const value = queue.shift();
            if (!value || typeof value !== 'object' || visited.has(value)) continue;
            visited.add(value);
            const name = clean(value.nickname || value.displayName || value.userName);
            if (name && name.length <= 60) { autoUser = name; break; }
            queue.push(...Object.values(value));
          }
        } catch (e) { /* ignore */ }
        if (autoUser) break;
      }
    } catch (e) { /* ignore */ }
  }

  // 匹配账号集：手填（可用逗号分隔多个）优先，否则用自动识别的
  const matchSet = [];
  if (manual) {
    const _seen = new Set();
    String(manual).split(/[,，、]/).forEach((s) => { const n = clean(s); if (n && !_seen.has(n)) { _seen.add(n); matchSet.push(n); } });
  }
  if (!matchSet.length && autoUser) matchSet.push(autoUser);
  const isMine = (name) => { const n = clean(name); return !!n && matchSet.indexOf(n) >= 0; };

  // ---- 我的评论数（DOM 翻页）----
  let commentCount = null;
  if (matchSet.length) {
    try {
      commentCount = 0;
      const itemsSel = '.xcp-item[data-reply-id]';
      const findLoadMore = () => {
        for (const el of document.querySelectorAll('.xcp-list-loader, button, [role="button"]')) {
          if (clean(el.textContent) === '查看更多评论') return el;
        }
        return null;
      };
      // 百家号评论可能在面板里，先点一下「评论」按钮确保评论区展开（找不到也无妨）
      try {
        const cmtBtn = Array.from(document.querySelectorAll('div.interact-btn'))
          .find((d) => d.querySelector('img[src*="icon_comment"]'));
        if (cmtBtn) cmtBtn.click();
        await sleep(800);
      } catch (e) { /* ignore */ }
      // 等首批评论出现（最多 ~10s）
      const deadline0 = Date.now() + 10000;
      while (Date.now() < deadline0) {
        if (document.querySelectorAll(itemsSel).length > 0) break;
        await sleep(250);
      }
      for (let page = 0; page < 100; page++) {
        const more = findLoadMore();
        if (!more) break;
        more.click();
        const before = document.querySelectorAll(itemsSel).length;
        const deadline = Date.now() + 8000;
        let after = before;
        while (Date.now() < deadline) {
          await sleep(250);
          after = document.querySelectorAll(itemsSel).length;
          if (after > before || !findLoadMore()) break;
        }
        if (after <= before && findLoadMore()) break;
      }
      const seen = new Set();
      for (const item of document.querySelectorAll(itemsSel)) {
        const cid = clean(item.dataset.replyId);
        if (!cid || seen.has(cid)) continue;
        seen.add(cid);
        const author = clean(item.querySelector('.user-bar-uname')?.textContent);
        if (isMine(author)) commentCount++;
      }
    } catch (e) {
      commentCount = null;
    }
  }

  // ---- 点赞 / 收藏 ----
  let liked = null;
  let collected = null;
  const findInteract = (imgKey) => {
    return Array.from(document.querySelectorAll('div.interact-btn'))
      .find((d) => d.querySelector(`img[src*="${imgKey}"]`));
  };
  const likeWrap = findInteract('icon_great');
  if (likeWrap) {
    const src = clean(likeWrap.querySelector('img')?.getAttribute('src'));
    liked = src.includes('_on');
  }
  const colWrap = findInteract('icon_collect');
  if (colWrap) {
    const src = clean(colWrap.querySelector('img')?.getAttribute('src'));
    collected = src.includes('_on');
  }

  return { platform: 'baidu', title, username: matchSet.join(','), commentCount, liked, collected };
}

const DETECTORS = {
  zhihu: detectZhihu,
  csdn: detectCsdn,
  toutiao: detectToutiao,
  baidu: detectBaidu,
};

/**
 * 在已打开文章页的 page 上执行检测。
 * @param {import('patchright').Page} page
 * @param {'zhihu'|'csdn'|'toutiao'|'baidu'} platform
 * @param {string} [manualUser] 手填账号（可用逗号分隔多个；优先于页面自动识别）
 */
async function detectArticle(page, platform, manualUser) {
  const fn = DETECTORS[platform];
  if (!fn) {
    return { platform, title: '', username: null, commentCount: null, liked: null, collected: null, unsupported: true };
  }
  try {
    return await page.evaluate(fn, manualUser || '');
  } catch (e) {
    return { platform, title: '', username: null, commentCount: null, liked: null, collected: null, error: e.message };
  }
}

module.exports = { detectArticle, DETECTORS };
