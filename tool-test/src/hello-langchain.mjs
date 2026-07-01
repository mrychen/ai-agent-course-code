/**
 * ============================================================
 * hello-langchain.mjs — LangChain 入门示例
 * ============================================================
 *
 * 这个文件演示了如何使用 LangChain 框架来调用大语言模型（LLM）。
 *
 * 核心流程只有三步：
 *   1. 加载环境变量（API Key、Base URL 等敏感/配置信息）
 *   2. 创建一个"模型"对象（这里用的是 OpenAI 兼容接口）
 *   3. 调用 model.invoke() 向模型发送消息，并打印回复
 *
 * 文件后缀是 .mjs，表示 ES Module（可以使用 import/await 顶层语法）。
 */
// ===================================================================
// 第一步：导入依赖
// ===================================================================

/**
 * dotenv 是一个 npm 包，用来加载 .env 文件中的环境变量。
 *
 * 为什么需要它？
 *   - API Key 是敏感信息，不能硬编码在代码里（否则提交到 git 就会泄露）
 *   - 不同的开发环境（本地/测试/生产）可能用不同的 Key 和 URL
 *   - .env 文件通常被 .gitignore 忽略，不会提交到仓库
 *
 * .env 文件长这样（放在项目根目录）：
 *   OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
 *   OPENAI_BASE_URL=https://api.openai.com/v1
 *   MODEL_NAME=gpt-4
 */
import dotenv from 'dotenv';
/**
 * ChatOpenAI 是 LangChain 提供的"聊天模型"类。
 *
 * 虽然名字带 "OpenAI"，但它实际上兼容任何提供 OpenAI 格式 API 的服务，
 * 包括国内的模型厂商（通义千问、智谱 GLM、DeepSeek 等）。
 *
 * 为什么用 LangChain 而不是直接调 HTTP API？
 *   - 统一的接口：换模型时只需改配置，不改业务代码
 *   - LangChain 提供了很多上层能力：链式调用、工具使用、记忆、RAG 等
 *   - 未来可以轻松切换到其他模型提供商
 */
import { ChatOpenAI } from '@langchain/openai';
// ===================================================================
// 第二步：加载环境变量
// ===================================================================
/**
 * dotenv.config() 会读取项目根目录的 .env 文件，
 * 把里面的 KEY=VALUE 注入到 process.env 对象中。
 *
 * 调用之后，就可以通过 process.env.XXX 来访问这些值了。
 *
 * 注意：这个调用必须放在使用环境变量之前！
 */
dotenv.config();
// ===================================================================
// 第三步：创建模型实例
// ===================================================================
/**
 * ChatOpenAI 构造函数接收一个配置对象，主要字段说明：
 *
 * @param {string} modelName   - 要使用的模型名称。
 *   默认值是 "qwen-coder-turbo"（阿里云的通义千问代码模型）。
 *   常见的模型名：
 *     OpenAI:     "gpt-4", "gpt-4o", "gpt-3.5-turbo"
 *     通义千问:    "qwen-turbo", "qwen-plus", "qwen-max"
 *     DeepSeek:   "deepseek-chat", "deepseek-coder"
 *     Moonshot:   "moonshot-v1-8k"
 *
 * @param {string} apiKey     - API 密钥，用于身份认证。
 *   每个模型厂商都会给你一个 Key，形如 "sk-xxxx"。
 *   这里是"消耗的谁的额度，就填谁的 Key"。
 *   注：LangChain v0.3+ 中，apiKey 可直接传，旧版本可能需要放在 configuration 里
 *
 * @param {object} configuration - 底层 OpenAI SDK 的原生配置。
 *   baseURL：API 服务的基础地址。
 *     不同的模型厂商有不同的地址：
 *       OpenAI 官方:  https://api.openai.com/v1
 *       通义千问:     https://dashscope.aliyuncs.com/compatible-mode/v1
 *       DeepSeek:    https://api.deepseek.com/v1
 *       Moonshot:    https://api.moonshot.cn/v1
 *     因为这里填的是通义千问的兼容地址，所以实际请求会发到阿里云。
 */
const model = new ChatOpenAI({
    modelName: process.env.MODEL_NAME || "qwen-coder-turbo",
    // ↑ 从环境变量取 MODEL_NAME，取不到就用默认值 "qwen-coder-turbo"
    // "||" 是 JavaScript 的"短路或"：左边有值就用左边，否则用右边

    apiKey: process.env.OPENAI_API_KEY,
    // ↑ API 密钥，必须从 .env 文件中加载
    // 如果不设置或设置错误，调用时会报 401 Unauthorized

    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
        // ↑ API 的基础地址
        // LangChain 会把 modelName 拼到后面，最终请求地址类似：
        // https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
    },
});

// ===================================================================
// 第四步：调用模型（最核心的一步）
// ===================================================================

/**
 * model.invoke(messages) 是 LangChain 中调用模型的标准方法。
 *
 * 参数 messages 可以是：
 *   1. 字符串 — 最简单的用法，等同于一条 HumanMessage（用户消息）
 *      model.invoke("介绍下自己")
 *
 *   2. 消息数组 — 可以包含多条历史消息，实现多轮对话：
 *      model.invoke([
 *        ["system", "你是一个幽默的助手"],    // 系统提示词（设定 AI 角色）
 *        ["human", "你好，你是谁？"],          // 用户消息
 *      ])
 *
 *      或者用 LangChain 的消息类：
 *      model.invoke([
 *        new SystemMessage("你是一个幽默的助手"),
 *        new HumanMessage("你好，你是谁？"),
 *        new AIMessage("我是你的快乐助手！"),
 *        new HumanMessage("讲个笑话"),
 *      ])
 *
 * 返回值 response 是一个 AIMessage 对象，包含：
 *   - response.content      → 模型的回复文字（string）
 *   - response.response_metadata → 元数据（token 用量、模型名、完成原因等）
 *
 * invoke 是异步方法，所以用 await 等待结果。
 * .mjs 文件支持顶层 await，不需要包在 async 函数里。
 *
 * 调用过程底层发生了什么？
 *   1. LangChain 把消息格式化成 OpenAI 兼容的 JSON
 *   2. 通过 HTTP POST 请求发送到 baseURL + "/chat/completions"
 *   3. 模型处理并返回生成的文本
 *   4. LangChain 把响应封装成 AIMessage 对象
 */
const response = await model.invoke("介绍下自己");

// ===================================================================
// 第五步：输出结果
// ===================================================================
/**
 * response.content 是模型回复的纯文本内容。
 *
 * 如果想看到更详细的信息，可以打印整个 response 对象：
 *   console.log(response);
 */
console.log(response.content);
