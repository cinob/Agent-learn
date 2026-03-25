/**
 * 打印从 1 到 10 的数字
 *
 * 这个函数演示了基本的循环结构，依次输出 1 到 10 的整数。
 *
 * @returns {void} 无返回值
 */
function printNumbers(): void {
  for (let i: number = 1; i <= 10; i++) {
    console.log(i)
  }
}

/**
 * 程序的主入口函数
 */
function main(): void {
  printNumbers()
}

// Main guard - 确保只在直接运行此文件时执行
if (require.main === module) {
  main()
}
