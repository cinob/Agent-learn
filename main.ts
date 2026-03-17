import fs from 'fs'

type Message = {
  role: string
  content: string
}

type ApiResponse = {
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

const ModelId = 'Pro/zai-org/GLM-5'
const System = `你是一个位于 ${process.cwd()} 的编程助手。使用 bash 解决任务。执行，不要解释。`
const Tools = [{
  type: "function",
  function: {
    name: "bash",
    description: "Run a shell command.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"]
    }
  }
}]

function runBash(command: string): string {
  const dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
  if (dangerous.some(danger => command.includes(danger)))
    return 'Error: Dangerous command blocked'
  
  try {
    const result = Bun.spawnSync({
      cmd: ['bash', '-c', command],
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120000
    })
    
    const out = (result.stdout.toString() + result.stderr.toString()).trim()
    return out ? out.slice(0, 50000) : "(no output)"
  } catch (error) {
    return "Error: Timeout (120s)"
  }
}

async function agentLoop(messages: Message[]) {
  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) throw new Error('SILICONFLOW_API_KEY not found')

  while (true) {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: ModelId,
        messages,
        tools: Tools,
        max_tokens: 8000
      })
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
      console.log(`\x1b[33m$ ${args.command}\x1b[0m`)
      const output = runBash(args.command)
      console.log(output.slice(0, 200))
      toolOutput += `[Tool ${toolCall.function.name}]: ${output}\n\n`
    }
    
    messages.push({ role: 'user', content: toolOutput.trim() })
  }
}

async function run() {
  const history: Message[] = [{ role: 'system', content: System }]
  
  while (true) {
    process.stdout.write('\x1b[36mcinob AI agent >> \x1b[0m')
    
    const query = await new Promise<string>((resolve) => {
      process.stdin.once('data', (data) => resolve(data.toString().trim()))
    })
    
    if (!query || ['q', 'exit'].includes(query.toLowerCase())) break
    
    history.push({ role: 'user', content: query })
    await agentLoop(history)
    
    const lastMessage = history[history.length - 1]
    if (lastMessage.role === 'assistant') {
      console.log(lastMessage.content)
    }
    console.log()
  }
  
  fs.writeFileSync('output.json', JSON.stringify(history, null, 2))

  process.exit(0)
}

run().catch(error => console.error('Error:', error))
