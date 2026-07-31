// patchright（Playwright 反检测 fork）：引擎层消除 CDP Runtime.enable 等自动化检测特征
const { chromium } = require("patchright");
const { generateQuestionComment, extractArticleText } = require('./aiComment');
const AI_CONFIG = require('./aiConfig');
const { checkPause } = require('./pauser');

(async () => {
  // ====================== 配置区（自行修改） ======================
  // CSDN 文章链接，替换成你自己的链接
  const csdnUrlList = [
];

  const perUrlCommentCount = 1; // 每个链接评论n次
  // patchright chromium 专用独立目录（全新未被风控标记）；首次运行需手动登录一次
  const userDataPath = 'D:\\playwright\\pw-data-csdn';
  // =================================================================

  // 浏览器窗口尺寸
  const winWidth = 1100;
  const winHeight = 900;

  // 随机等待时间（毫秒）
  function randomSleep (min = 2000, max = 5000) {
    const ms = Math.floor(Math.random() * (max - min) + min);
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  let context;
  try
  {
    // 启动持久化浏览器上下文（patchright 自带 chromium，引擎层已消除自动化检测特征）
    // 注意：不能用 channel:'msedge'，否则 patchright 的核心 patch 会失效
    context = await chromium.launchPersistentContext(userDataPath, {
      headless: false,
      viewport: { width: winWidth, height: winHeight }
    });
    // patchright 已从协议层隐藏所有自动化检测点，无需手动注入 stealth

    // 首次运行：检查 CSDN 登录态，未登录则打开首页等待手动登录（登录后自动继续）
    {
      const loginPage = await context.newPage();
      await loginPage.goto('https://www.csdn.net/', { waitUntil: 'load' });
      // CSDN 登录后会有 UserName cookie（核心登录标识）
      const hasLogin = async () => (await context.cookies()).some(c => c.name === 'UserName');
      if (!(await hasLogin()))
      {
        console.log('⚠️ 未检测到 CSDN 登录态：请在弹出的窗口里手动登录 CSDN，登录后会自动继续（最多等 5 分钟）。');
        const deadline = Date.now() + 5 * 60 * 1000;
        while (Date.now() < deadline)
        {
          await loginPage.waitForTimeout(2000);
          if (await hasLogin()) break;
        }
        if (!(await hasLogin())) throw new Error('等待登录超时，请重新运行');
      }
      console.log('✅ 已登录 CSDN，开始评论任务');
      await loginPage.close();
    }

    // 循环遍历文章列表
    for (const targetUrl of csdnUrlList)
    {
      console.log(`\n===== 开始处理文章：${targetUrl} =====`);
      await checkPause();
      let page;
      try
      {
        // 每次循环新建独立页面，单独捕获页面内部错误
        page = await context.newPage();

        // 先访问首页建立会话
        await page.goto('https://www.csdn.net/', { waitUntil: "load" });
        await randomSleep();

        // 打开目标文章
        await page.goto(targetUrl, { waitUntil: "load" });
        await randomSleep();

        // 提取文章正文，供 AI 生成针对性的提问评论（每篇抓一次，多条评论复用）
        const articleText = await extractArticleText(page);
        console.log(`已提取正文约 ${articleText.length} 字`);

        // 每篇文章点赞+收藏（在评论之前执行一次）
        try
        {
          // 点赞：CSDN 的点赞按钮是 a.tool-item-href（第一个）
          // 判断是否已点赞：检查按钮内 img.isactive 是否可见（已点赞时 display:block）
          const likeBtn = page.locator('a.tool-item-href').first();
          await likeBtn.waitFor({ timeout: 10000 });
          const likeActiveImg = likeBtn.locator('img.isactive#is-like-imgactive');
          const isLiked = await likeActiveImg.isVisible();
          if (isLiked)
          {
            console.log('⏭️ 已点过赞，跳过');
          } else
          {
            await likeBtn.click();
            console.log('✅ 已点赞');
          }
          await randomSleep(1000, 2000);

          // 收藏：判断是否已收藏（同样检查 img.isactive 是否可见）
          const collectBtn = page.locator('a.tool-item-href[data-report-click*="4130"]').first();
          await collectBtn.waitFor({ timeout: 10000 });
          const collectActiveImg = collectBtn.locator('img.isactive#is-collection-imgactive');
          const isCollected = await collectActiveImg.isVisible();
          if (isCollected)
          {
            console.log('⏭️ 已收藏过，跳过');
          } else
          {
            // 未收藏：点击后会弹出二级菜单，需要选择收藏夹
            await collectBtn.click();
            await randomSleep(500, 1000);
            // 等待收藏夹列表出现，点击第一个收藏夹的"收藏"按钮
            const collectFolderBtn = page.locator('ul.csdn-collection-items li .collect-btn').first();
            await collectFolderBtn.waitFor({ timeout: 5000 });
            await collectFolderBtn.click();
            console.log('✅ 已收藏');
          }
          await randomSleep(1000, 2000);
        } catch (actionErr)
        {
          console.log('⚠️ 点赞/收藏操作失败（可能按钮位置变化或已操作过），继续评论：', actionErr.message);
        }

        // 点击"评论"按钮，打开评论侧边栏
        try
        {
          const commentBtn = page.locator('a.go-side-comment').first();
          await commentBtn.click({ timeout: 5000 });
          await randomSleep(1000, 2000);
          console.log('✅ 已打开评论面板');
        } catch (panelErr)
        {
          console.log('⚠️ 未找到评论按钮或已展开，继续：', panelErr.message);
        }

        // 循环当前文章评论n次
        for (let i = 1; i <= perUrlCommentCount; i++)
        {
          console.log(`当前文章第 ${i}/${perUrlCommentCount} 条评论`);

          // 调用 AI 根据正文生成一条提问式评论；生成失败则跳过本条
          let randomText;
          try
          {
            randomText = await generateQuestionComment(articleText, AI_CONFIG);
          } catch (genErr)
          {
            console.log(`⚠️ AI 生成失败，跳过本条：`, genErr.message);
            await randomSleep(3000, 6000);
            continue;
          }
          console.log(`本次评论内容：${randomText}`);

          try
          {
            // 定位评论输入框：CSDN 用 textarea#comment_content
            const editor = page.locator('textarea#comment_content').first();
            await editor.waitFor({ timeout: 30000 });
            await editor.click();
            await randomSleep(500, 1000);

            // 清空可能的残留内容，然后模拟真实键盘输入（激活发布按钮）
            await editor.fill(''); // textarea 用 fill 清空
            await editor.type(randomText, { delay: 50 }); // 每个字符间隔 50ms，模拟人工输入
            await randomSleep(1000, 2000);

            // 定位并点击发布按钮
            const publishBtn = page.locator('input.btn-comment-input[type="submit"]').first();
            await publishBtn.click({ timeout: 30000 });

            console.log(`✅ 第${i}条评论发布成功`);
            // 仅等待，移除页面刷新 reload 代码
            await randomSleep(4000, 8000);

          } catch (innerErr)
          {
            console.log(`❌ 第${i}条评论发布失败：`, innerErr.message);
            await randomSleep(6000, 10000);
            continue;
          }
        }
      } catch (pageErr)
      {
        console.log(`❌ 当前页面操作异常，跳过本篇文章：`, pageErr.message);
      } finally
      {
        // 安全关闭当前页面，增加容错判断
        if (page && !page.isClosed())
        {
          await page.close().catch(() => { });
        }
      }
      console.log(`===== 当前文章全部评论完成 =====`);
      // 切换下一篇文章前长间隔，降低崩溃概率
      await randomSleep(8000, 15000);
    }

    console.log(`\n✅ 所有${csdnUrlList.length}篇文章评论任务全部执行完毕！`);
  } catch (globalErr)
  {
    console.log("❌ 全局浏览器上下文崩溃：", globalErr.message);
  } finally
  {
    // 程序结束安全关闭浏览器
    if (context)
    {
      await context.close().catch(() => { });
    }
  }
})();
