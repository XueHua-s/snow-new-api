const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 保存日志到文件并打开
function saveAndOpenErrorLog(serverErrorLogs) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `new-api-crash-${timestamp}.log`;
    const logDir = app.getPath('logs');
    const logFilePath = path.join(logDir, logFileName);

    // 确保日志目录存在
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 写入日志
    const logContent = `New API 崩溃日志
生成时间: ${new Date().toLocaleString('zh-CN')}
平台: ${process.platform}
架构: ${process.arch}
应用版本: ${app.getVersion()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

完整错误日志:

${serverErrorLogs.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

日志文件位置: ${logFilePath}
`;

    fs.writeFileSync(logFilePath, logContent, 'utf8');

    // 打开日志文件
    shell.openPath(logFilePath).then((error) => {
      if (error) {
        console.error('Failed to open log file:', error);
        // 如果打开文件失败，至少显示文件位置
        shell.showItemInFolder(logFilePath);
      }
    });

    return logFilePath;
  } catch (err) {
    console.error('Failed to save error log:', err);
    return null;
  }
}

// 分析错误日志，识别常见错误并提供解决方案
function analyzeError(errorLogs, PORT) {
  const allLogs = errorLogs.join('\n');

  // 检测端口占用错误
  if (allLogs.includes('failed to start HTTP server') ||
      allLogs.includes('bind: address already in use') ||
      allLogs.includes('listen tcp') && allLogs.includes('bind: address already in use')) {
    return {
      type: '端口被占用',
      title: '端口 ' + PORT + ' 被占用',
      message: '无法启动服务器，端口已被其他程序占用',
      solution: `可能的解决方案：\n\n1. 关闭占用端口 ${PORT} 的其他程序\n2. 检查是否已经运行了另一个 New API 实例\n3. 使用以下命令查找占用端口的进程：\n   Mac/Linux: lsof -i :${PORT}\n   Windows: netstat -ano | findstr :${PORT}\n4. 重启电脑以释放端口`
    };
  }

  // 检测数据库错误
  if (allLogs.includes('database is locked') ||
      allLogs.includes('unable to open database')) {
    return {
      type: '数据文件被占用',
      title: '无法访问数据文件',
      message: '应用的数据文件正被其他程序占用',
      solution: '可能的解决方案：\n\n1. 检查是否已经打开了另一个 New API 窗口\n   - 查看任务栏/Dock 中是否有其他 New API 图标\n   - 查看系统托盘（Windows）或菜单栏（Mac）中是否有 New API 图标\n\n2. 如果刚刚关闭过应用，请等待 10 秒后再试\n\n3. 重启电脑以释放被占用的文件\n\n4. 如果问题持续，可以尝试：\n   - 退出所有 New API 实例\n   - 删除数据目录中的临时文件（.db-shm 和 .db-wal）\n   - 重新启动应用'
    };
  }

  // 检测权限错误
  if (allLogs.includes('permission denied') ||
      allLogs.includes('access denied')) {
    return {
      type: '权限错误',
      title: '权限不足',
      message: '程序没有足够的权限执行操作',
      solution: '可能的解决方案：\n\n1. 以管理员/root权限运行程序\n2. 检查数据目录的读写权限\n3. 检查可执行文件的权限\n4. 在 Mac 上，检查安全性与隐私设置'
    };
  }

  // 检测网络错误
  if (allLogs.includes('network is unreachable') ||
      allLogs.includes('no such host') ||
      allLogs.includes('connection refused')) {
    return {
      type: '网络错误',
      title: '网络连接失败',
      message: '无法建立网络连接',
      solution: '可能的解决方案：\n\n1. 检查网络连接是否正常\n2. 检查防火墙设置\n3. 检查代理配置\n4. 确认目标服务器地址正确'
    };
  }

  // 检测配置文件错误
  if (allLogs.includes('invalid configuration') ||
      allLogs.includes('failed to parse config') ||
      allLogs.includes('yaml') || allLogs.includes('json') && allLogs.includes('parse')) {
    return {
      type: '配置错误',
      title: '配置文件错误',
      message: '配置文件格式不正确或包含无效配置',
      solution: '可能的解决方案：\n\n1. 检查配置文件格式是否正确\n2. 恢复默认配置\n3. 删除配置文件让程序重新生成\n4. 查看文档了解正确的配置格式'
    };
  }

  // 检测内存不足
  if (allLogs.includes('out of memory') ||
      allLogs.includes('cannot allocate memory')) {
    return {
      type: '内存不足',
      title: '系统内存不足',
      message: '程序运行时内存不足',
      solution: '可能的解决方案：\n\n1. 关闭其他占用内存的程序\n2. 增加系统可用内存\n3. 重启电脑释放内存\n4. 检查是否存在内存泄漏'
    };
  }

  // 检测文件不存在错误
  if (allLogs.includes('no such file or directory') ||
      allLogs.includes('cannot find the file')) {
    return {
      type: '文件缺失',
      title: '找不到必需的文件',
      message: '缺少程序运行所需的文件',
      solution: '可能的解决方案：\n\n1. 重新安装应用程序\n2. 检查安装目录是否完整\n3. 确保所有依赖文件都存在\n4. 检查文件路径是否正确'
    };
  }

  return null;
}

module.exports = { saveAndOpenErrorLog, analyzeError };
