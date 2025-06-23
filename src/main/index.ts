import { app, BrowserWindow, shell, Menu } from 'electron';
import * as path from 'path';
import { MainController } from './controllers/MainController';

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;
let controller: MainController | null = null;

// Enable live reload for Electron
if (process.env.NODE_ENV === 'development') {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electronReload = require('electron-reload');
        electronReload(__dirname, {
            electron: path.join(__dirname, '..', '..', 'node_modules', '.bin', 'electron'),
            hardResetMethod: 'exit'
        });
    } catch (e) {
        console.log('electron-reload not available');
    }
}

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true
        },
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1e1e1e',
        show: false
    });

    // Create application menu
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Conversation',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow?.webContents.send('menu:new-conversation');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
                { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
                { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
                { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
                { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
                { type: 'separator' },
                { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Load the index.html of the app
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Emitted when the window is closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    // Create main window
    createWindow();

    if (mainWindow) {
        // Initialize controller
        controller = new MainController();
        controller.setMainWindow(mainWindow);
    }

    app.on('activate', () => {
        // On macOS, re-create a window when the dock icon is clicked
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
    // On macOS, keep the app running even when all windows are closed
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle app shutdown
app.on('before-quit', () => {
    // Clean up controller
    if (controller) {
        controller.cleanup();
    }
});

// Security: Prevent new window creation
app.on('web-contents-created', (_, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
});

// Handle certificate errors
app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
    // In development, ignore certificate errors
    if (process.env.NODE_ENV === 'development') {
        event.preventDefault();
        callback(true);
    } else {
        // In production, use default behavior
        callback(false);
    }
});