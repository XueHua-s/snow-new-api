const { app, BrowserWindow, dialog, Tray, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { saveAndOpenErrorLog, analyzeError } = require('./server-diagnostics');

let mainWindow;
let serverProcess;
let tray = null;
let serverErrorLogs = [];
const PORT = 3000;
const DEV_FRONTEND_PORT = 5173; // Rsbuild dev server port

function getBinaryPath() {
  const isDev = process.env.NODE_ENV === 'development';
  const platform = process.platform;

  if (isDev) {
    const binaryName = platform === 'win32' ? 'new-api.exe' : 'new-api';
    return path.join(__dirname, '..', binaryName);
  }

  let binaryName;
  switch (platform) {
    case 'win32':
      binaryName = 'new-api.exe';
      break;
    case 'darwin':
      binaryName = 'new-api';
      break;
    case 'linux':
      binaryName = 'new-api';
      break;
    default:
      binaryName = 'new-api';
  }

  return path.join(process.resourcesPath, 'bin', binaryName);
}

// Check if a server is available with retry logic
function checkServerAvailability(port, maxRetries = 30, retryDelay = 1000) {
  return new Promise((resolve, reject) => {
    let currentAttempt = 0;
    
    const tryConnect = () => {
      currentAttempt++;
      
      if (currentAttempt % 5 === 1 && currentAttempt > 1) {
        console.log(`Attempting to connect to port ${port}... (attempt ${currentAttempt}/${maxRetries})`);
      }
      
      const req = http.get({
        hostname: '127.0.0.1', // Use IPv4 explicitly instead of 'localhost' to avoid IPv6 issues
        port: port,
        timeout: 10000
      }, (res) => {
        // Server responded, connection successful
        req.destroy();
        console.log(`✓ Successfully connected to port ${port} (status: ${res.statusCode})`);
        resolve();
      });

      req.on('error', (err) => {
        if (currentAttempt >= maxRetries) {
          reject(new Error(`Failed to connect to port ${port} after ${maxRetries} attempts: ${err.message}`));
        } else {
          setTimeout(tryConnect, retryDelay);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (currentAttempt >= maxRetries) {
          reject(new Error(`Connection timeout on port ${port} after ${maxRetries} attempts`));
        } else {
          setTimeout(tryConnect, retryDelay);
        }
      });
    };
    
    tryConnect();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const isDev = process.env.NODE_ENV === 'development';

    const userDataPath = app.getPath('userData');
    const dataDir = path.join(userDataPath, 'data');
    
    // 设置环境变量供 preload.js 使用
    process.env.ELECTRON_DATA_DIR = dataDir;
    
    if (isDev) {
      // 开发模式：假设开发者手动启动了 Go 后端和前端开发服务器
      // 只需要等待前端开发服务器就绪
      console.log('Development mode: skipping server startup');
      console.log('Please make sure you have started:');
      console.log('  1. Go backend: go run main.go (port 3000)');
      console.log('  2. Frontend dev server: make dev-web (port 5173)');
      console.log('');
      console.log('Checking if servers are running...');
      
      // First check if both servers are accessible
      checkServerAvailability(DEV_FRONTEND_PORT)
        .then(() => {
          console.log('✓ Frontend dev server is accessible on port 5173');
          resolve();
        })
        .catch((err) => {
          console.error(`✗ Cannot connect to frontend dev server on port ${DEV_FRONTEND_PORT}`);
          console.error('Please make sure the frontend dev server is running:');
          console.error('  make dev-web');
          reject(err);
        });
      return;
    }

    // 生产模式：启动二进制服务器
    const env = { ...process.env, PORT: PORT.toString() };

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    env.SQLITE_PATH = path.join(dataDir, 'new-api.db');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📁 您的数据存储位置：');
    console.log('   ' + dataDir);
    console.log('   💡 备份提示：复制此目录即可备份所有数据');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const binaryPath = getBinaryPath();
    const workingDir = process.resourcesPath;
    
    console.log('Starting server from:', binaryPath);

    serverProcess = spawn(binaryPath, [], {
      env,
      cwd: workingDir
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      console.error(`Server Error: ${errorMsg}`);
      serverErrorLogs.push(errorMsg);
      // 只保留最近的100条错误日志
      if (serverErrorLogs.length > 100) {
        serverErrorLogs.shift();
      }
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });

    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
      
      // 如果退出代码不是0，说明服务器异常退出
      if (code !== 0 && code !== null) {
        const errorDetails = serverErrorLogs.length > 0 
          ? serverErrorLogs.slice(-20).join('\n') 
          : '没有捕获到错误日志';
        
        // 分析错误类型
        const knownError = analyzeError(serverErrorLogs, PORT);
        
        let dialogOptions;
        if (knownError) {
          // 识别到已知错误，显示友好的错误信息和解决方案
          dialogOptions = {
            type: 'error',
            title: knownError.title,
            message: knownError.message,
            detail: `${knownError.solution}\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n退出代码: ${code}\n\n错误类型: ${knownError.type}\n\n最近的错误日志:\n${errorDetails}`,
            buttons: ['退出应用', '查看完整日志'],
            defaultId: 0,
            cancelId: 0
          };
        } else {
          // 未识别的错误，显示通用错误信息
          dialogOptions = {
            type: 'error',
            title: '服务器崩溃',
            message: '服务器进程异常退出',
            detail: `退出代码: ${code}\n\n最近的错误信息:\n${errorDetails}`,
            buttons: ['退出应用', '查看完整日志'],
            defaultId: 0,
            cancelId: 0
          };
        }
        
        dialog.showMessageBox(dialogOptions).then((result) => {
          if (result.response === 1) {
            // 用户选择查看详情，保存并打开日志文件
            const logPath = saveAndOpenErrorLog(serverErrorLogs);
            
            // 显示确认对话框
            const confirmMessage = logPath 
              ? `日志已保存到:\n${logPath}\n\n日志文件已在默认文本编辑器中打开。\n\n点击"退出"关闭应用程序。`
              : '日志保存失败，但已在控制台输出。\n\n点击"退出"关闭应用程序。';
            
            dialog.showMessageBox({
              type: 'info',
              title: '日志已保存',
              message: confirmMessage,
              buttons: ['退出'],
              defaultId: 0
            }).then(() => {
              app.isQuitting = true;
              app.quit();
            });
            
            // 同时在控制台输出
            console.log('=== 完整错误日志 ===');
            console.log(serverErrorLogs.join('\n'));
          } else {
            // 用户选择直接退出
            app.isQuitting = true;
            app.quit();
          }
        });
      } else {
        // 正常退出（code为0或null），直接关闭窗口
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.close();
        }
      }
    });

    checkServerAvailability(PORT)
      .then(() => {
        console.log('✓ Backend server is accessible on port 3000');
        resolve();
      })
      .catch((err) => {
        console.error('✗ Failed to connect to backend server');
        reject(err);
      });
  });
}

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';
  const loadPort = isDev ? DEV_FRONTEND_PORT : PORT;
  
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'New API',
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadURL(`http://127.0.0.1:${loadPort}`);
  
  console.log(`Loading from: http://127.0.0.1:${loadPort}`);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Close to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Use template icon for macOS (black with transparency, auto-adapts to theme)
  // Use colored icon for Windows
  const trayIconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'tray-iconTemplate.png')
    : path.join(__dirname, 'tray-icon-windows.png');

  tray = new Tray(trayIconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show New API',
      click: () => {
        if (mainWindow === null) {
          createWindow();
        } else {
          mainWindow.show();
          if (process.platform === 'darwin') {
            app.dock.show();
          }
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('New API');
  tray.setContextMenu(contextMenu);

  // On macOS, clicking the tray icon shows the window
  tray.on('click', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      if (mainWindow.isVisible() && process.platform === 'darwin') {
        app.dock.show();
      }
    }
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    createTray();
    createWindow();
  } catch (err) {
    console.error('Failed to start application:', err);
    
    // 分析启动失败的错误
    const knownError = analyzeError(serverErrorLogs, PORT);
    
    if (knownError) {
      dialog.showMessageBox({
        type: 'error',
        title: knownError.title,
        message: `启动失败: ${knownError.message}`,
        detail: `${knownError.solution}\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n错误信息: ${err.message}\n\n错误类型: ${knownError.type}`,
        buttons: ['退出', '查看完整日志'],
        defaultId: 0,
        cancelId: 0
      }).then((result) => {
        if (result.response === 1) {
          // 用户选择查看日志
          const logPath = saveAndOpenErrorLog(serverErrorLogs);
          
          const confirmMessage = logPath 
            ? `日志已保存到:\n${logPath}\n\n日志文件已在默认文本编辑器中打开。\n\n点击"退出"关闭应用程序。`
            : '日志保存失败，但已在控制台输出。\n\n点击"退出"关闭应用程序。';
          
          dialog.showMessageBox({
            type: 'info',
            title: '日志已保存',
            message: confirmMessage,
            buttons: ['退出'],
            defaultId: 0
          }).then(() => {
            app.quit();
          });
          
          console.log('=== 完整错误日志 ===');
          console.log(serverErrorLogs.join('\n'));
        } else {
          app.quit();
        }
      });
    } else {
      dialog.showMessageBox({
        type: 'error',
        title: '启动失败',
        message: '无法启动服务器',
        detail: `错误信息: ${err.message}\n\n请检查日志获取更多信息。`,
        buttons: ['退出', '查看完整日志'],
        defaultId: 0,
        cancelId: 0
      }).then((result) => {
        if (result.response === 1) {
          // 用户选择查看日志
          const logPath = saveAndOpenErrorLog(serverErrorLogs);
          
          const confirmMessage = logPath 
            ? `日志已保存到:\n${logPath}\n\n日志文件已在默认文本编辑器中打开。\n\n点击"退出"关闭应用程序。`
            : '日志保存失败，但已在控制台输出。\n\n点击"退出"关闭应用程序。';
          
          dialog.showMessageBox({
            type: 'info',
            title: '日志已保存',
            message: confirmMessage,
            buttons: ['退出'],
            defaultId: 0
          }).then(() => {
            app.quit();
          });
          
          console.log('=== 完整错误日志 ===');
          console.log(serverErrorLogs.join('\n'));
        } else {
          app.quit();
        }
      });
    }
  }
});

app.on('window-all-closed', () => {
  // Don't quit when window is closed, keep running in tray
  // Only quit when explicitly choosing Quit from tray menu
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', (event) => {
  if (serverProcess) {
    event.preventDefault();

    console.log('Shutting down server...');
    serverProcess.kill('SIGTERM');

    setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill('SIGKILL');
      }
      app.exit();
    }, 5000);

    serverProcess.on('close', () => {
      serverProcess = null;
      app.exit();
    });
  }
});
