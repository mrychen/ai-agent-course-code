/**
 * all-tools.mjs — AI Agent 的工具箱
 * ====================================
 * 这个文件定义了 AI 可以使用的四个工具（函数）：
 *   1. read_file    — 读取文件内容
 *   2. write_file   — 写入/创建文件
 *   3. execute_command — 在终端执行命令（如 npm install）
 *   4. list_directory  — 列出目录中的文件
 *
 * 每个工具由三部分组成：
 *   - 实现函数：工具实际要执行的逻辑
 *   - 元数据：名称(name)和描述(description)，AI 通过它们理解工具的用途
 *   - Schema：参数定义（使用 Zod 库），AI 会按照这个格式生成参数
 *
 * LangChain 的 tool() 函数会自动把这三者打包成一个"工具对象"，
 * 模型通过 bindTools() 绑定后就能调用它们了。
 */

// tool: LangChain 的核心工具定义函数，把普通函数包装成 AI 可调用的工具
import { tool } from '@langchain/core/tools';

// fs/promises: Node.js 的文件系统模块（Promise 版本），支持 async/await 风格
// 比回调版本更简洁，不会陷入"回调地狱"
import fs from 'node:fs/promises';

// path: Node.js 的路径处理模块，用于拼接路径、获取目录名等操作
import path from 'node:path';

// spawn: Node.js 的子进程模块，用于执行系统命令
// 相比 exec，spawn 能处理大量输出，并且支持实时流式输出
import { exec, spawn } from 'node:child_process';

// z: Zod 库，用于定义和校验数据格式
// 这里用来定义工具参数的"形状"（有哪些字段、什么类型、是否必填）
// AI 看到 Schema 就知道该传什么参数，用户传错时也能自动报错
import { z } from 'zod';

// ============================================================
// 1. 读取文件工具 (read_file)
// ============================================================
// 让 AI 能够读取磁盘上的任意文件内容
const readFileTool = tool(
  // ----- 第一个参数：实现函数 -----
  // { filePath } 是从 AI 传来的参数中解构出来的，由 Schema 定义
  async ({ filePath }) => {
    try {
      // fs.readFile: 读取文件，'utf-8' 表示以文本方式读取（而不是二进制 Buffer）
      const content = await fs.readFile(filePath, 'utf-8');

      // 打印日志，让用户知道 AI 在做什么（方便调试和观察）
      console.log(`  [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`);

      // 返回文件内容给 AI
      // 这个字符串会作为 ToolMessage 注入对话，AI 在下一轮就能"看到"它
      return `文件内容:\n${content}`;
    } catch (error) {
      // 如果文件不存在或没有权限，捕获错误并返回错误信息
      // 注意：这里返回字符串而非抛出异常，让 AI 知道"读取失败了"并尝试其他方式
      console.log(`  [工具调用] read_file("${filePath}") - 错误: ${error.message}`);
      return `读取文件失败: ${error.message}`;
    }
  },
  // ----- 第二个参数：工具的元数据和参数定义 -----
  {
    name: 'read_file',                              // 工具名称，AI 通过它来指定要调用的工具
    description: '读取指定路径的文件内容',            // 工具描述，AI 通过它理解工具的用途
    schema: z.object({                               // 参数 Schema：告诉 AI 需要传什么参数
      filePath: z.string().describe('文件路径'),      // filePath 是必填的字符串参数
    }),
  }
);

// ============================================================
// 2. 写入文件工具 (write_file)
// ============================================================
// 让 AI 能够创建或覆写文件
// 这是 AI 编程助手的核心能力——"写代码到文件"
const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      // path.dirname: 从文件路径中提取目录部分
      // 例如 '/a/b/c.txt' → '/a/b'
      const dir = path.dirname(filePath);

      // fs.mkdir: 创建目录，{ recursive: true } 表示自动创建所有不存在的父目录
      // 类似 mkdir -p，例如自动创建 /a/b/c/ 如果它们都不存在
      await fs.mkdir(dir, { recursive: true });

      // fs.writeFile: 写入文件内容，如果文件已存在则覆盖
      await fs.writeFile(filePath, content, 'utf-8');

      console.log(`  [工具调用] write_file("${filePath}") - 成功写入 ${content.length} 字节`);
      return `文件写入成功: ${filePath}`;
    } catch (error) {
      console.log(`  [工具调用] write_file("${filePath}") - 错误: ${error.message}`);
      return `写入文件失败: ${error.message}`;
    }
  },
  {
    name: 'write_file',
    description: '向指定路径写入文件内容，自动创建目录',
    schema: z.object({
      filePath: z.string().describe('文件路径'),      // 要写入的文件路径
      content: z.string().describe('要写入的文件内容'), // 要写入的内容（通常是代码）
    }),
  }
);

// ============================================================
// 3. 执行命令工具 (execute_command)
// ============================================================
// 让 AI 能够在终端执行系统命令
// 这是最强大的工具——AI 可以用它安装依赖、运行项目、执行任意脚本
//
// 重要设计决策：
// - 使用 spawn（而非 exec）：支持实时输出，用户能即时看到命令运行情况
// - stdio: 'inherit'：命令的输出直接打印到当前终端，就像用户亲自执行一样
// - shell: true：让命令在 shell 中执行，支持管道、重定向等 shell 语法
const executeCommandTool = tool(
  async ({ command, workingDirectory }) => {
    // 如果 AI 指定了工作目录就用它，否则用当前进程的工作目录
    const cwd = workingDirectory || process.cwd();
    console.log(`  [工具调用] execute_command("${command}")${workingDirectory ? ` - 工作目录: ${workingDirectory}` : ''}`);

    // 用 Promise 包裹 spawn，把事件驱动的方式转为 async/await 风格
    // spawn 本身是基于事件的（on('close')），包装后可以用 await 等待命令执行完毕
    return new Promise((resolve, reject) => {
      // 将命令字符串按空格拆分为命令名和参数数组
      // 例如 "pnpm install" → cmd='pnpm', args=['install']
      const [cmd, ...args] = command.split(' ');

      // spawn: 创建子进程执行命令
      const child = spawn(cmd, args, {
        cwd,                // 指定工作目录
        stdio: 'inherit',   // 子进程的输出直接继承父进程的标准输入/输出/错误
        // 这样命令的输出会实时显示在用户的终端中
        shell: true,        // 在 shell 中执行（支持管道 |、重定向 > 等 shell 语法）
      });

      let errorMsg = '';

      // 监听 error 事件：命令无法启动时触发（如命令不存在）
      child.on('error', (error) => {
        errorMsg = error.message;
      });

      // 监听 close 事件：命令结束时触发
      // code 是退出码，0 表示成功，非 0 表示失败
      child.on('close', (code) => {
        if (code === 0) {
          // 命令执行成功
          console.log(`  [工具调用] execute_command("${command}") - 执行成功`);

          // 附加提示：如果指定了工作目录，提醒 AI 后续命令也要用 workingDirectory
          // 而不是在 command 里写 cd（这是常见的 AI 犯的错误）
          const cwdInfo = workingDirectory
            ? `\n\n重要提示：命令在目录 "${workingDirectory}" 中执行成功。如果需要在这个项目目录中继续执行命令，请使用 workingDirectory: "${workingDirectory}" 参数，不要使用 cd 命令。`
            : '';

          resolve(`命令执行成功: ${command}${cwdInfo}`);
        } else {
          // 命令执行失败（退出码非 0）
          console.log(`  [工具调用] execute_command("${command}") - 执行失败，退出码: ${code}`);
          resolve(`命令执行失败，退出码: ${code}${errorMsg ? '\n错误: ' + errorMsg : ''}`);
        }
      });
    });
  },
  {
    name: 'execute_command',
    description: '执行系统命令，支持指定工作目录，实时显示输出',
    schema: z.object({
      command: z.string().describe('要执行的命令'),                          // 必填，如 "pnpm install"
      workingDirectory: z.string().optional().describe('工作目录（推荐指定）'), // 可选，指定命令在哪个目录执行
    }),
  }
);

// ============================================================
// 4. 列出目录工具 (list_directory)
// ============================================================
// 让 AI 能够查看某个目录下有哪些文件
// 类似于在终端执行 ls 或 dir 命令
const listDirectoryTool = tool(
  async ({ directoryPath }) => {
    try {
      // fs.readdir: 读取目录，返回目录下所有文件和子目录的名称数组
      const files = await fs.readdir(directoryPath);

      console.log(`  [工具调用] list_directory("${directoryPath}") - 找到 ${files.length} 个项目`);

      // 将文件名格式化为 Markdown 列表，方便 AI 阅读
      return `目录内容:\n${files.map(f => `- ${f}`).join('\n')}`;
    } catch (error) {
      console.log(`  [工具调用] list_directory("${directoryPath}") - 错误: ${error.message}`);
      return `列出目录失败: ${error.message}`;
    }
  },
  {
    name: 'list_directory',
    description: '列出指定目录下的所有文件和文件夹',
    schema: z.object({
      directoryPath: z.string().describe('目录路径'),
    }),
  }
);

// ============================================================
// 5. 导出所有工具
// ============================================================
// 其他文件（如 mini-cursor.mjs）通过 import 引入这些工具
// 然后在 model.bindTools(tools) 中绑定给 AI 使用
export { readFileTool, writeFileTool, executeCommandTool, listDirectoryTool };
