// aiVideoComment.js
// 视频评论生成：用视觉理解模型（GLM-4.6V）读取视频内容，生成提问式评论。
// 接口为 OpenAI chat completions 兼容格式，content 使用多模态数组（video_url + text）。
// Node 18+ 内置 fetch，无需额外依赖。

// 视频版提示：看完视频后提出真实、有针对性的问题
const VIDEO_PROMPT = [
  '你是一个看完视频后对内容有真实兴趣的观众，会提出有针对性的问题。',
  '请根据视频内容，写出 1 条中文评论，要求：',
  '1. 不要吹捧、夸奖，也不要复述视频内容；',
  '2. 紧扣视频里具体出现的产品/技术/场景，提出 1 个有针对性的真实问题（围绕适用场景、实现细节、实际效果等）；',
  '3. 语气自然、口语化，像真实观众随手提问，25~60 字；',
  '4. 只输出评论本身，不要加引号、编号或额外说明。',
].join('\n');

/**
 * 用视觉模型根据视频生成一条提问式评论。
 * @param {string} videoUrl 视频可访问 URL（公网，传给模型的 video_url）
 * @param {object} cfg { endpoint, apiKey, model, maxTokens?, temperature? }
 * @returns {Promise<string>}
 */
async function generateVideoComment(videoUrl, cfg = {}) {
  const { endpoint, apiKey, model, maxTokens = 200, temperature = 0.9 } = cfg;
  if (!endpoint || !apiKey || !model) {
    throw new Error('请先在 aiVideoConfig 中填写 endpoint / apiKey / model');
  }
  if (!videoUrl) throw new Error('未获取到视频地址，无法生成评论');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: VIDEO_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'video_url', video_url: { url: videoUrl } },
            { type: 'text', text: '请看完这段视频后，按要求写 1 条提问式评论。' },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  const data = await readJsonOrThrow(res);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('视觉模型未返回评论内容：' + JSON.stringify(data).slice(0, 500));
  return cleanComment(text);
}

/**
 * 从 Playwright 页面提取视频源地址（优先 video[src]，兜底 video>source[src]）。
 * @param {import('patchright').Page} page
 * @returns {Promise<string>}
 */
async function extractVideoUrl(page) {
  const video = page.locator('video').first();
  if (await video.count().catch(() => 0)) {
    const src = await video.getAttribute('src').catch(() => null);
    if (src) return src;
  }
  const source = page.locator('video source').first();
  if (await source.count().catch(() => 0)) {
    const src = await source.getAttribute('src').catch(() => null);
    if (src) return src;
  }
  return '';
}

async function readJsonOrThrow(res) {
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`视觉模型接口返回 ${res.status} ${res.statusText}：${errText.slice(0, 500)}`);
  }
  return res.json();
}

function cleanComment(text) {
  return String(text).trim().replace(/^["'「『]+|["'」』]+$/g, '').trim();
}

module.exports = { generateVideoComment, extractVideoUrl, VIDEO_PROMPT };
