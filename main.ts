/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

interface Message {
  role: string
  content: string
}

interface ApiResponse {
  choices: Array<{
    message: {
      content: string
      tool_calls?: Array<{
        id: string
        type: string
        function: {
          name: string
          arguments: string
        }
      }>
    }
    finish_reason: string
  }>
}

const WORKDIR = process.cwd()
const MODEL = 'Pro/zai-org/GLM-5'
const SYSTEM = `你是一个位于 ${WORKDIR} 的编程助手。使用 bash 解决任务。执行，不要解释。`

function safePath(p: string): string {
  const resolved = path.resolve(WORKDIR, p)
  if (!resolved.startsWith(WORKDIR + path.sep) && resolved !== WORKDIR)
    throw new Error(`Path escapes workspace: ${p}`)
  return resolved
}

const TOOL_HANDLERS: Record<string, (args: any) => string> = {
  bash: args => runBash(args.command),
  read_file: args => readFile(args.path, args.limit),
  write_file: args => writeFile(args.path, args.content),
  edit_file: args => editFile(args.path, args.old_text, args.new_text),
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run a shell command.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read file contents.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace exact text in file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_text: { type: 'string' },
          new_text: { type: 'string' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },
]

function runBash(command: string): string {
  const dangerous = ['rm -rf /', 'sudo', 'shutdown', 'reboot', '> /dev/']
  if (dangerous.some(danger => command.includes(danger)))
    return 'Error: Dangerous command blocked'

  try {
    const result = Bun.spawnSync({
      cmd: ['bash', '-c', command],
      cwd: WORKDIR,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120000,
    })

    const out = (result.stdout.toString() + result.stderr.toString()).trim()
    return out ? out.slice(0, 50000) : '(no output)'
  }
  catch {
    return 'Error: Timeout (120s)'
  }
}

function readFile(filePath: string, limit?: number): string {
  try {
    const text = fs.readFileSync(safePath(filePath), 'utf-8')
    const lines = text.split('\n')
    if (limit && limit < lines.length) {
      return `${lines.slice(0, limit).join('\n')}\n... (${lines.length - limit} more lines)`
    }
    return text.slice(0, 50000)
  }
  catch (e: any) {
    return `Error: ${e.message}`
  }
}

function writeFile(filePath: string, content: string): string {
  try {
    const fp = safePath(filePath)
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, content)
    return `Wrote ${content.length} bytes to ${filePath}`
  }
  catch (e: any) {
    return `Error: ${e.message}`
  }
}

function editFile(filePath: string, oldText: string, newText: string): string {
  try {
    const fp = safePath(filePath)
    const content = fs.readFileSync(fp, 'utf-8')
    if (!content.includes(oldText))
      return `Error: Text not found in ${filePath}`
    fs.writeFileSync(fp, content.replace(oldText, newText))
    return `Edited ${filePath}`
  }
  catch (e: any) {
    return `Error: ${e.message}`
  }
}

async function agentLoop(messages: Message[]) {
  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey)
    throw new Error('SILICONFLOW_API_KEY not found')

  while (true) {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: TOOLS,
        max_tokens: 8000,
      }),
    })

    const data = await response.json() as ApiResponse
    const choice = data.choices[0]
    // console.log(JSON.stringify(choice, null, 2))

    messages.push({ role: 'assistant', content: choice.message.content })

    if (choice.finish_reason !== 'tool_calls' || !choice.message.tool_calls) {
      return
    }

    let toolOutput = ''
    for (const toolCall of choice.message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments)
      const handler = TOOL_HANDLERS[toolCall.function.name]
      const output = handler ? handler(args) : `Unknown tool: ${toolCall.function.name}`
      console.log(`> ${toolCall.function.name}: ${output.slice(0, 200)}`)
      toolOutput += `[Tool ${toolCall.function.name}]: ${output}\n\n`
    }

    messages.push({ role: 'user', content: toolOutput.trim() })
  }
}

async function run() {
  const history: Message[] = [{ role: 'system', content: SYSTEM }]

  while (true) {
    process.stdout.write('\x1B[36mcinob AI agent >> \x1B[0m')

    const query = await new Promise<string>((resolve) => {
      process.stdin.once('data', data => resolve(data.toString().trim()))
    })

    if (!query || ['q', 'exit'].includes(query.toLowerCase()))
      break

    history.push({ role: 'user', content: query })
    await agentLoop(history)

    const lastMessage = history.at(-1)!
    if (lastMessage.role === 'assistant') {
      console.log(lastMessage.content)
    }
    console.log()
  }

  fs.writeFileSync('output.json', JSON.stringify(history, null, 2))

  process.exit(0)
}

run().catch(error => console.error('Error:', error))
