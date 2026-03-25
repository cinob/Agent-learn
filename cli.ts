import process from 'node:process'
import readline from 'node:readline'

export type HandleQuery = (query: string) => Promise<void>

export function startCli(handleQuery: HandleQuery, onExit?: () => void) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1B[36mcinob AI agent >> \x1B[0m',
  })

  let busy = false

  rl.on('line', async (line) => {
    const query = line.trim()

    if (!query || ['q', 'exit'].includes(query.toLowerCase())) {
      rl.close()
      return
    }

    if (busy) {
      console.log('上一个请求还在处理，请稍等...')
      rl.prompt()
      return
    }

    busy = true

    // 显示动态“正在思考...”动画，并在期间隐藏光标
    process.stdout.write('\x1B[?25l')
    let dots = 0
    const thinkingInterval = setInterval(() => {
      const dotStr = '.'.repeat((dots % 3) + 1)
      process.stdout.write(`\r正在思考${dotStr}   `)
      dots++
    }, 300)

    try {
      await handleQuery(query)
    }
    catch (error) {
      console.error('处理请求时出错:', error)
    }
    finally {
      clearInterval(thinkingInterval)
      process.stdout.write('\r\x1B[K') // 清掉“正在思考...”这一行
      process.stdout.write('\x1B[?25h') // 恢复光标
      busy = false
      rl.prompt()
    }
  })

  rl.on('close', () => {
    onExit?.()
    process.exit(0)
  })

  rl.prompt()
}
