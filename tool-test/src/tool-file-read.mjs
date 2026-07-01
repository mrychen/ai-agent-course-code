// ============================================================
// 第一部分：导入依赖
// ============================================================

// dotenv/config：自动读取项目根目录下 .env 文件中的环境变量，
// 并注入到 process.env 中（如 API Key、模型名称等配置）
import 'dotenv/config';

// ChatOpenAI：LangChain 提供的 OpenAI 兼容聊天模型类。
// 只要兼容 OpenAI API 格式的大模型都可以用它来调用
// （如 Qwen、DeepSeek、GLM 等国产模型）
import { ChatOpenAI } from '@langchain/openai';

// tool：LangChain 提供的工具包装函数，
// 用于把一个普通的 JS 函数包装成 AI 可以调用的"工具"
import { tool } from '@langchain/core/tools';

// HumanMessage / SystemMessage / ToolMessage：
// LangChain 中的三种消息类型
// - SystemMessage：系统提示词，用于设定 AI 的角色和行为规则
// - HumanMessage：用户发送的消息
// - ToolMessage：工具执行后返回的结果消息
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

// fs/promises：Node.js 内置的文件系统模块（Promise 版本），
// 用 async/await 的方式读写文件，避免回调地狱
import fs from 'node:fs/promises';

// zod：TypeScript 优先的数据验证库。
// 在这里用来定义工具参数的"形状"（schema），
// 告诉 AI 调用工具时需要传什么参数、参数是什么类型
import { z } from 'zod';


// ============================================================
// 第二部分：初始化模型
// ============================================================

// 创建一个模型实例，配置从环境变量中读取
const model = new ChatOpenAI({
  // 模型名称：优先取环境变量 MODEL_NAME，没设置则默认用 qwen-coder-turbo
  modelName: process.env.MODEL_NAME || "qwen-coder-turbo",

  // API 密钥：从环境变量 OPENAI_API_KEY 读取
  // 注意：即使你用国产模型（如千问），通常也复用 OPENAI_API_KEY 这个变量名
  apiKey: process.env.OPENAI_API_KEY,

  // temperature: 控制回复的随机性，0 表示最确定（每次结果一样），
  // 适合代码分析这种需要精确输出的场景
  temperature: 0,

  // configuration：底层网络请求的额外配置
  configuration: {
    // baseURL：API 端点地址。国产模型的服务商通常提供兼容 OpenAI 格式的地址，
    // 比如千问的 DashScope、DeepSeek 的 API 等
    baseURL: process.env.OPENAI_BASE_URL,
  },
});


// ============================================================
// 第三部分：定义工具（Tool）
// ============================================================

// tool() 接收两个参数：
//   1. 一个异步函数 —— 工具的实际执行逻辑
//   2. 一个配置对象 —— 包含工具名、描述、参数 schema
//
// 当 AI 决定"我需要调用这个工具"时，它会输出一个 tool_call，
// 包含工具名和参数。然后你的程序执行这个函数，把结果返回给 AI。
const readFileTool = tool(
  // 参数1：工具的执行函数
  // filePath 由 AI 根据 schema 的定义自动传入
  async ({ filePath }) => {
    // fs.readFile 读取文件内容，'utf-8' 指定编码为文本
    const content = await fs.readFile(filePath, 'utf-8');

    // 在控制台打印日志，方便调试时看到工具被调用了
    console.log(`[工具调用] read_file("${filePath}")-成功读取 ${content.length} 字节`);

    // 返回读取到的文件内容。
    // 这个返回值会被包装成 ToolMessage 发送回给 AI 模型
    return `文件内容:\n${content}`;
  },

  // 参数2：工具的元信息配置
  {
    // name：工具的唯一标识名。AI 会说"我要调用 read_file"
    name: 'read_file',

    // description：用自然语言告诉 AI 这个工具是什么、什么时候用它。
    // 写清楚用途非常重要！AI 就是靠这段描述来决定是否调用工具的
    description:
      '用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。',

    // schema：用 Zod 定义参数结构。AI 会根据这个 schema 生成正确格式的参数。
    // z.object({...}) 表示参数是一个对象，里面有哪些字段、各是什么类型。
    schema: z.object({
      // z.string()：定义一个字符串类型字段
      // .describe()：对这个字段的自然语言说明，AI 靠它理解字段含义
      filePath: z.string().describe('要读取的文件路径'),
    }),
  }
);

// 把所有工具放到一个数组中。
// 如果将来添加更多工具（如 write_file、search_code 等），
// 只需要把新工具 push 到这个数组里即可
const tools = [
  readFileTool
];


// ============================================================
// 第四部分：绑定工具到模型
// ============================================================

// model.bindTools(tools)：
// 这是 OpenAI 的 "Function Calling" / "Tool Use" 机制的核心步骤。
// 它告诉模型："你现在可以使用这些工具了"。
// 绑定后，模型在需要时会自动在输出中附带 tool_calls，
// 而不是直接回答用户。
//
// modelWithTools 和 model 是同一个模型，只是"装备"了工具能力。
// 当你用 modelWithTools 调用时，它会判断：
//   - 可以直接回答 → 返回普通文本
//   - 需要调用工具 → 返回 tool_calls 数组
const modelWithTools = model.bindTools(tools);


// ============================================================
// 第五部分：构建消息历史
// ============================================================

// messages 数组是"对话历史"，LLM 用它来理解上下文。
// 每次调用模型，都会把整个 messages 数组发过去。
const messages = [
  // SystemMessage：系统提示词
  // 定义 AI 的角色、行为边界、工作流程等。
  // 用户看不到这条消息，但它在幕后指导 AI 的行为。
  new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。

工作流程：
1. 用户要求读取文件时，立即调用 read_file 工具
2. 等待工具返回文件内容
3. 基于文件内容进行分析和解释

可用工具：
- read_file: 读取文件内容（使用此工具来获取文件内容）
`),

  // HumanMessage：用户消息
  // 模拟用户发来的请求。这里要求 AI 读取当前文件并解释代码。
  new HumanMessage('请读取 ./src/tool-file-read.mjs 文件内容并解释代码')
];


// ============================================================
// 第六部分：第一次调用模型
// ============================================================

// 把 messages 发给模型，模型会分析：
// "用户要我读取文件 → 我需要调用 read_file 工具"
// 所以返回的 response 中会包含 tool_calls，而不是普通文本。
let response = await modelWithTools.invoke(messages);

// 把这次调用的结果（不管是文本还是 tool_calls）追加到对话历史中。
// 这样才能保持上下文连贯。
messages.push(response);

//  [
//   {
//     name: 'read_file',
//     args: { filePath: './src/tool-file-read.mjs' },
//     type: 'tool_call',
//     id: 'call_00_BJGdqAyzxQap6ImCxtTT4427'
//   }
// ]
console.log("🚀 - tool-file-read.mjs:170 - response:", response.tool_calls)


// ============================================================
// 第七部分：工具调用循环（Agent Loop）
// ============================================================

// 这是 AI Agent 的核心循环逻辑：
// 只要模型还返回了 tool_calls（说明它还想调用工具），就一直循环
while (response.tool_calls && response.tool_calls.length > 0) {

  // 打印检测到的工具调用数量
  console.log(`\n[检测到 ${response.tool_calls.length} 个工具调用]`);

  // 并行执行所有工具调用
  // Promise.all：同时执行多个异步操作，等全部完成再继续。
  // 如果 AI 一次调用了 read_file 和 write_file，
  // 它们会同时执行，而不是等到一个完成再进行下一个。
  const toolResults = await Promise.all(
    response.tool_calls.map(async (toolCall) => {
      // 在 tools 数组中查找对应的工具
      const tool = tools.find(t => t.name === toolCall.name);

      // 如果找不到工具（理论上不会发生，但做个防御性检查）
      if (!tool) {
        return `错误: 找不到工具 ${toolCall.name}`;
      }

      // 打印日志：哪个工具被调用了，传了什么参数
      console.log(`  [执行工具] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);

      try {
        // 执行工具！tool.invoke(toolCall.args) 就是调用第一步定义的那个函数
        const result = await tool.invoke(toolCall.args);
        return result;
      } catch (error) {
        // 如果工具执行出错了（如文件不存在），不要直接崩溃，
        // 而是把错误信息返回给 AI，让 AI 知道发生了什么
        return `错误: ${error.message}`;
      }
    })
  );

  // 把每个工具调用的结果包装成 ToolMessage，追加到对话历史。
  // 这一步非常关键！AI 依赖这些 ToolMessage 来获取工具的执行结果。
  //
  // ToolMessage 的三个属性：
  //   - content：工具返回的内容
  //   - tool_call_id：必须和对应的 tool_call 的 id 匹配，
  //                   这样 AI 才知道"这个结果是哪个调用的返回值"
  response.tool_calls.forEach((toolCall, index) => {
    messages.push(
      new ToolMessage({
        content: toolResults[index],        // 工具执行结果
        tool_call_id: toolCall.id,          // 绑定的调用 ID
      })
    );
  });

  // 带着新的消息历史（现在包含工具结果了）再次调用模型。
  // 模型看到工具返回的文件内容后，通常会：
  //   1. 如果还需要更多工具调用 → 继续返回 tool_calls（继续循环）
  //   2. 如果信息够用了 → 返回普通文本回复（退出循环）
  response = await modelWithTools.invoke(messages);
}

// 循环结束后，response 是模型的最终文本回复
// （不再包含 tool_calls，因为已经退出 while 了）


// ============================================================
// 第八部分：输出最终结果
// ============================================================

console.log('\n[最终回复]');
// response.content 是 AI 对用户请求的最终回答。
// 在这个例子里，应该是 AI 读完了文件后，对代码的解释和分析。
console.log(response.content);
