// 使用 patchright（Playwright 反检测 fork）：引擎层消除 CDP Runtime.enable 等自动化检测特征，
// 是知乎等严格风控平台能正常访问的关键。普通 playwright 会被 40362 拦截。
const { chromium } = require("patchright");
const { generateQuestionComment, extractArticleText } = require('./aiComment');
const AI_CONFIG = require('./aiConfig');
const { checkPause } = require('./pauser');

(async () => {
  // ====================== 配置区（自行修改） ======================
  // 知乎专栏链接，替换成你自己的链接
  const zhihuUrlList = [
  ];

  const perUrlCommentCount = 1; // 每个链接评论n次
  // patchright chromium 专用独立目录（全新未被知乎标记）；首次运行需手动登录一次
  const userDataPath = 'D:\\playwright\\pw-data-zhihu';
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
    // 注意：不能用 channel:'msedge'，否则 patchright 的核心 patch（Runtime.enable 绕过）会失效
    context = await chromium.launchPersistentContext(userDataPath, {
      headless: false,
      viewport: { width: winWidth, height: winHeight }
    });
    // patchright 已从协议层隐藏了 Runtime.enable、navigator.webdriver、--enable-automation 等所有检测点，
    // 无需手动注入 stealth init script（手动注入反而会留下 toString 检测痕迹）。

    // 首次运行：检查知乎登录态，未登录则打开首页等待手动登录（登录后自动继续）
    {
      const loginPage = await context.newPage();
      await loginPage.goto('https://www.zhihu.com/', { waitUntil: 'load' });
      const hasLogin = async () => (await context.cookies()).some(c => c.name === 'z_c0');
      if (!(await hasLogin()))
      {
        console.log('⚠️ 未检测到知乎登录态：请在弹出的窗口里手动登录知乎，登录后会自动继续（最多等 5 分钟）。');
        const deadline = Date.now() + 5 * 60 * 1000;
        while (Date.now() < deadline)
        {
          await loginPage.waitForTimeout(2000);
          if (await hasLogin()) break;
        }
        if (!(await hasLogin())) throw new Error('等待登录超时，请重新运行');
      }
      console.log('✅ 已登录知乎，开始评论任务');
      await loginPage.close();
    }

    // 循环遍历链接
    for (const targetUrl of zhihuUrlList)
    {
      console.log(`\n===== 开始处理文章：${targetUrl} =====`);
      await checkPause();
      let page;
      try
      {
        // 每次循环新建独立页面，单独捕获页面内部错误
        page = await context.newPage();

        // 先访问首页建立会话（模拟真人浏览行为）
        await page.goto('https://www.zhihu.com/', { waitUntil: "load" });
        await randomSleep(3000, 6000);
        // 在首页模拟几次滚动，更像正常用户
        try
        {
          await page.evaluate(() => {
            window.scrollBy(0, Math.random() * 400 + 200);
          });
          await randomSleep(1000, 3000);
          await page.evaluate(() => {
            window.scrollBy(0, Math.random() * 200 - 300);
          });
          await randomSleep(1000, 2000);
        } catch (scrollErr) { /* 滚动失败不影响主流程 */ }

        // 打开目标专栏文章（patchright 下 page.goto 已安全，加 referer 模拟从首页点击进入）
        await page.goto(targetUrl, { waitUntil: 'load', referer: 'https://www.zhihu.com/' });
        await randomSleep();

        // 提取文章正文，供 AI 生成针对性的提问评论（每篇抓一次，多条评论复用）
        const articleText = await extractArticleText(page);
        console.log(`已提取正文约 ${articleText.length} 字`);

        // 每篇文章点赞+喜欢+收藏（在评论之前执行一次）
        try
        {
          // 点赞：按钮 aria-label 是 "赞同 X"（X 是数字），点击后变 "已赞同 X" + class 增加 "is-active"
          const likeBtn = page.getByRole('button', { name: /^(赞同|已赞同)/ });
          await likeBtn.waitFor({ timeout: 10000 });
          const likeLabel = await likeBtn.getAttribute('aria-label');
          if (likeLabel?.startsWith('已赞同'))
          {
            console.log('⏭️ 已点过赞，跳过');
          } else if (likeLabel?.startsWith('赞同'))
          {
            await likeBtn.click();
            console.log('✅ 已点赞');
          }
          await randomSleep(1000, 2000);

          // 喜欢：文章底部按钮 aria-label 为 "喜欢"，点击后变 "取消喜欢"
          // 用 aria-label 属性定位（评论列表也有"喜欢"文本按钮，getByRole 会匹配多个）
          const loveBtn = page.locator('button.ContentItem-action[aria-label="喜欢"], button.ContentItem-action[aria-label="取消喜欢"]').first();
          await loveBtn.waitFor({ timeout: 10000 });
          const loveLabel = await loveBtn.getAttribute('aria-label');
          if (loveLabel === '取消喜欢')
          {
            console.log('⏭️ 已喜欢过，跳过');
          } else if (loveLabel === '喜欢')
          {
            await loveBtn.click();
            console.log('✅ 已喜欢');
          }
          await randomSleep(1000, 2000);

          // 收藏：按钮 aria-label 精确是 "收藏"，点击后变 "已收藏"
          const collectBtn = page.getByRole('button', { name: /^(收藏|已收藏)$/ });
          await collectBtn.waitFor({ timeout: 10000 });
          const collectLabel = await collectBtn.getAttribute('aria-label');
          if (collectLabel === '已收藏')
          {
            console.log('⏭️ 已收藏过，跳过');
          } else if (collectLabel === '收藏')
          {
            await collectBtn.click();
            console.log('✅ 已收藏');
          }
          await randomSleep(1000, 2000);
        } catch (actionErr)
        {
          console.log('⚠️ 点赞/喜欢/收藏操作失败（可能按钮位置变化），继续评论：', actionErr.message);
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
            // 定位评论输入框（发过评论后页面可能同时存在两个编辑器，取第一个）
            const editor = page.getByRole('textbox', { placeholder: '理性发言，友善互动' }).first();
            await editor.waitFor({ timeout: 60000 });
            await editor.fill(randomText);
            await randomSleep(1000, 3000);

            // 定位并点击发布按钮（click 自带可见/可点击等待）
            // —— 测试阶段先注释，确认无误后取消注释即可真正发布
            const publishBtn = page.getByRole('button', { name: '发布', exact: true });
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

    console.log(`\n✅ 所有${zhihuUrlList.length}篇文章评论任务全部执行完毕！`);
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