/**
 * mini-cursor.mjs — 迷你 AI 编程助手（类似 Cursor 的简化版）
 * ============================================================
 * 这个文件实现了一个能够使用工具的 AI Agent：
 * 它可以读取文件、写入文件、执行命令、列出目录，
 * 通过多轮对话自动完成复杂的编程任务（比如创建一个 React 项目）。
 *
 * 核心流程：
 *   用户提问 → AI 思考 → AI 决定调用工具 → 执行工具 → 返回结果给 AI → AI 再思考 → ... → 最终回复
 */

// 加载 .env 文件中的环境变量（如 API Key、Base URL 等）
import 'dotenv/config';

// ChatOpenAI：LangChain 中对 OpenAI 兼容 API 的封装类
// 只要 API 与 OpenAI 格式兼容（如通义千问、DeepSeek 等），都可以用它来调用
import { ChatOpenAI } from '@langchain/openai';

// 消息类型：HumanMessage（用户消息）、SystemMessage（系统提示）、ToolMessage（工具返回结果）
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

// 导入四个工具函数：执行命令、列出目录、读取文件、写入文件
// 这些工具是 AI 的"手"，让 AI 能够真正操作文件系统
import { executeCommandTool, listDirectoryTool, readFileTool, writeFileTool } from './all-tools.mjs';

// chalk：用于在终端输出彩色文字，让日志更易读
import chalk from 'chalk';

// ============================================================
// 1. 创建大模型实例
// ============================================================
const model = new ChatOpenAI({
    modelName: process.env.MODEL_NAME || "qwen-plus",                    // 使用的模型名称（这里用的是通义千问）
    apiKey: process.env.OPENAI_API_KEY,        // API 密钥，从环境变量读取，不要硬编码在代码里
    temperature: 0,                             // 温度设为 0，让 AI 输出更确定、更稳定（适合编程场景）
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,  // 自定义 API 地址，用于代理或兼容服务
    },
});

// ============================================================
// 2. 定义可用工具列表
// ============================================================
// AI 只能使用这个列表里的工具，每个工具都有名称、描述和参数定义
// 这样 AI 就知道自己"会什么"
const tools = [
    readFileTool,        // 读取文件内容
    writeFileTool,       // 写入/创建文件
    executeCommandTool,  // 在终端执行命令（如 pnpm install）
    listDirectoryTool,   // 列出目录中的文件
];

// ============================================================
// 3. 将工具绑定到模型
// ============================================================
// bindTools() 会把工具的定义（名称、描述、参数）告诉模型
// 之后模型在回复时，如果需要使用工具，就会返回 tool_calls 而不是普通文本
const modelWithTools = model.bindTools(tools);

// ============================================================
// 4. Agent 执行函数 —— 整个程序的核心
// ============================================================
/**
 * 运行带工具的 AI Agent，支持多轮对话和工具调用
 *
 * @param {string} query - 用户的初始问题/任务描述
 * @param {number} maxIterations - 最大循环次数（防止无限循环），默认 30 轮
 * @returns {string} AI 的最终回复文本
 */
async function runAgentWithTools(query, maxIterations = 30) {
    // ----- 初始化消息列表 -----
    // 消息列表是整个对话的"记忆"，每次都会把完整历史发给 AI
    const messages = [
        // SystemMessage：系统提示词，定义 AI 的角色、能力和规则
        // 它是"幕后导演"，用户看不到，但决定了 AI 的行为方式
        new SystemMessage(`你是一个项目管理助手，使用工具完成任务。

当前工作目录: ${process.cwd()}

工具：
1. read_file: 读取文件
2. write_file: 写入文件
3. execute_command: 执行命令（支持 workingDirectory 参数）
4. list_directory: 列出目录

重要规则 - execute_command：
- workingDirectory 参数会自动切换到指定目录
- 当使用 workingDirectory 时，绝对不要在 command 中使用 cd
- 错误示例: { command: "cd react-todo-app && pnpm install", workingDirectory: "react-todo-app" }
这是错误的！因为 workingDirectory 已经在 react-todo-app 目录了，再 cd react-todo-app 会找不到目录
- 正确示例: { command: "pnpm install", workingDirectory: "react-todo-app" }
这样就对了！workingDirectory 已经切换到 react-todo-app，直接执行命令即可

重要规则 - write_file：
- 当写入 React 组件文件（如 App.tsx）时，如果存在对应的 CSS 文件（如 App.css），在其他 import 语句后加上这个 css 的导入
`),
        // HumanMessage：用户的真实输入
        new HumanMessage(query)
    ];

    // ----- 主循环：多轮对话 + 工具调用 -----
    // AI 可能需要多轮"思考 → 调用工具 → 观察结果 → 再思考"才能完成任务
    // maxIterations 是安全阀，防止 AI 陷入无限循环
    for (let i = 0; i < maxIterations; i++) {
        // 打印状态提示，让用户知道 AI 正在工作
        console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));

        // 【关键】调用模型，传入完整的消息历史
        // 模型会根据历史决定：直接回复文本，还是调用某个工具
        const response = await modelWithTools.invoke(messages);

        // 把 AI 的回复也加入消息历史（保持对话上下文）
        messages.push(response);

        // ----- 判断 AI 是否想调用工具 -----
        // 如果 tool_calls 为空或不存在，说明 AI 已经完成了任务，
        // 此时 response.content 就是最终答案
        if (!response.tool_calls || response.tool_calls.length === 0) {
            console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
            return response.content;  // 返回最终结果，结束循环
        }

        // ----- 执行 AI 请求的工具调用 -----
        // AI 可能一次请求调用多个工具，所以用 for 循环逐个处理
        for (const toolCall of response.tool_calls) {
            // 在工具列表中查找匹配的工具
            const foundTool = tools.find(t => t.name === toolCall.name);

            if (foundTool) {
                // 找到了对应的工具，执行它！
                // toolCall.args 是 AI 生成的参数（如文件路径、命令等）
                const toolResult = await foundTool.invoke(toolCall.args);

                // 将工具执行结果包装成 ToolMessage，加入对话历史
                // 这样 AI 在下一轮就能"看到"工具执行的结果，据此继续推理
                messages.push(new ToolMessage({
                    content: toolResult,        // 工具返回的内容（如文件内容、命令输出等）
                    tool_call_id: toolCall.id,  // 必须与 tool_calls 中的 id 对应
                }));
            }
        }
        // 本轮结束，回到循环开头，AI 会根据工具返回的结果继续思考...
    }

    // 如果达到最大循环次数仍然没有最终答案，返回最后一条消息
    return messages[messages.length - 1].content;
}

// ============================================================
// 5. 定义任务：创建一个功能丰富的 React TodoList 应用
// ============================================================
// 这是给 AI 的完整任务描述，包含了详细的步骤和要求
// echo 在 windows 可能不支持，可以去掉 echo 试试，不一定需要用户选择，或者换成 windows 的命令写法
const case1 = `创建一个功能丰富的 React TodoList 应用：

1. 创建项目：echo -e "n\nn" | pnpm create vite react-todo-app --template react-ts
2. 修改 src/App.tsx，实现完整功能的 TodoList：
 - 添加、删除、编辑、标记完成
 - 分类筛选（全部/进行中/已完成）
 - 统计信息显示
 - localStorage 数据持久化
3. 添加复杂样式：
 - 渐变背景（蓝到紫）
 - 卡片阴影、圆角
 - 悬停效果
4. 添加动画：
 - 添加/删除时的过渡动画
 - 使用 CSS transitions
5. 列出目录确认

注意：使用 pnpm，功能要完整，样式要美观，要有动画效果

之后在 react-todo-app 项目中：
1. 使用 pnpm install 安装依赖
2. 使用 pnpm run dev 启动服务器
`;

// ============================================================
// 6. 启动 Agent，执行任务
// ============================================================
// try-catch 捕获可能的错误（如 API 调用失败、网络问题等）
try {
    // 将任务交给 AI Agent，让它自动完成
    await runAgentWithTools(case1);
} catch (error) {
    // 打印友好的错误信息
    console.error(`\n❌ 错误: ${error.message}\n`);
}
