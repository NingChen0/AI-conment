// aiVideoConfig.js
// 视频视觉模型配置（独立于文本模型 aiConfig.js）
// 用于 GLM-4.6V / glm-5v-turbo 等视觉理解模型，理解视频内容后生成评论
module.exports = {
  // 智谱 GLM 视觉模型官方接口（OpenAI chat completions 兼容格式）
  endpoint: '',
  // 在这里填你的 GLM API Key（bigmodel.cn 控制台获取）
  apiKey: '',
  // 视觉模型名：glm-4.6v 或 glm-5v-turbo（官方示例用的 turbo 版）
  model: '',
};
