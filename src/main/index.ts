import { app, BrowserWindow, Menu, shell, dialog, protocol } from 'electron';
import { MainController } from './controllers/MainController';
import path from 'path';
import { fileURLToPath } from 'url';

// Handle __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Application {
    private mainWindow: BrowserWindow | null = null;
    private controller: MainController;

    constructor() {
        this.controller = new MainController();
        this.setupApp();
    }

    private setupApp(): void {
        // Security: Prevent new window creation
        app.on('web-contents-created', (_event, contents) => {
            contents.setWindowOpenHandler(({ url }) => {
                shell.openExternal(url);
                return { action: 'deny' };
            });
        });

        // Single instance lock
        const gotTheLock = app.requestSingleInstanceLock();

        if (!gotTheLock) {
            app.quit();
        } else {
            app.on('second-instance', () => {
                // Someone tried to run a second instance, focus our window instead
                if (this.mainWindow) {
                    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
                    this.mainWindow.focus();
                }
            });

            app.whenReady().then(() => {
                this.createWindow();
                this.setupMenu();
                this.setupProtocol();
            });
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('before-quit', () => {
            this.controller.cleanup();
        });
    }

    private createWindow(): void {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            title: 'Claude Desktop Client',
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
            backgroundColor: '#1a1a1a',
            titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
            show: false,
        });

        // Set CSP headers
        this.mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self'",
                        "script-src 'self' 'unsafe-inline'",
                        "style-src 'self' 'unsafe-inline'",
                        "img-src 'self' data: https:",
                        "font-src 'self'",
                        "connect-src 'self'",
                        "media-src 'self'",
                        "object-src 'none'",
                        "base-uri 'self'",
                        "form-action 'self'",
                        "frame-ancestors 'none'",
                    ].join('; '),
                },
            });
        });

        // Show window when ready
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();

            // Focus on the window
            if (process.platform === 'darwin') {
                app.dock.show();
            }
        });

        // Load the app
        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.loadURL('http://localhost:5173');
            this.mainWindow.webContents.openDevTools();
        } else {
            this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
        }

        // Pass window to controller
        this.controller.setMainWindow(this.mainWindow);

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }

    private setupMenu(): void {
        const template: Electron.MenuItemConstructorOptions[] = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'New Conversation',
                        accelerator: 'CmdOrCtrl+N',
                        click: () => {
                            this.mainWindow?.webContents.send('menu:new-conversation');
                        },
                    },
                    {
                        label: 'Open Conversation',
                        accelerator: 'CmdOrCtrl+O',
                        click: () => {
                            this.mainWindow?.webContents.send('menu:open-conversation');
                        },
                    },
                    { type: 'separator' },
                    {
                        label: 'Export Conversation',
                        submenu: [
                            {
                                label: 'As JSON',
                                click: () => {
                                    this.mainWindow?.webContents.send('menu:export', { format: 'json' });
                                },
                            },
                            {
                                label: 'As Markdown',
                                click: () => {
                                    this.mainWindow?.webContents.send('menu:export', { format: 'markdown' });
                                },
                            },
                        ],
                    },
                    {
                        label: 'Import Conversation',
                        click: async () => {
                            const result = await dialog.showOpenDialog(this.mainWindow!, {
                                filters: [
                                    { name: 'JSON Files', extensions: ['json'] },
                                    { name: 'All Files', extensions: ['*'] },
                                ],
                                properties: ['openFile'],
                            });

                            if (!result.canceled && result.filePaths.length > 0) {
                                this.mainWindow?.webContents.send('menu:import', { filePath: result.filePaths[0] });
                            }
                        },
                    },
                    { type: 'separator' },
                    {
                        label: 'Settings',
                        accelerator: 'CmdOrCtrl+,',
                        click: () => {
                            this.mainWindow?.webContents.send('menu:settings');
                        },
                    },
                    { type: 'separator' },
                    process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
                ],
            },
            {
                label: 'Edit',
                submenu: [
                    { role: 'undo' },
                    { role: 'redo' },
                    { type: 'separator' },
                    { role: 'cut' },
                    { role: 'copy' },
                    { role: 'paste' },
                    { role: 'selectAll' },
                    { type: 'separator' },
                    {
                        label: 'Find',
                        accelerator: 'CmdOrCtrl+F',
                        click: () => {
                            this.mainWindow?.webContents.send('menu:find');
                        },
                    },
                ],
            },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' },
                ],
            },
            {
                label: 'Conversation',
                submenu: [
                    {
                        label: 'Rename',
                        accelerator: 'F2',
                        click: () => {
                            this.mainWindow?.webContents.send('menu:rename-conversation');
                        },
                    },
                    {
                        label: 'Delete',
                        accelerator: 'Delete',
                        click: () => {
                            this.mainWindow?.webContents.send('menu:delete-conversation');
                        },
                    },
                    { type: 'separator' },
                    {
                        label: 'Clear Messages',
                        click: () => {
                            this.mainWindow?.webContents.send('menu:clear-messages');
                        },
                    },
                ],
            },
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'Documentation',
                        click: () => {
                            shell.openExternal('https://github.com/claude-desktop-client/docs');
                        },
                    },
                    {
                        label: 'Report Issue',
                        click: () => {
                            shell.openExternal('https://github.com/claude-desktop-client/issues');
                        },
                    },
                    { type: 'separator' },
                    {
                        label: 'About',
                        click: () => {
                            dialog.showMessageBox(this.mainWindow!, {
                                type: 'info',
                                title: 'About Claude Desktop Client',
                                message: 'Claude Desktop Client',
                                detail: 'Version 1.0.0\n\nA desktop application for multi-provider LLM interaction.\n\nBuilt with Electron, React, and TypeScript.',
                                buttons: ['OK'],
                            });
                        },
                    },
                ],
            },
        ];

        // macOS specific menu adjustments
        if (process.platform === 'darwin') {
            template.unshift({
                label: app.getName(),
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    {
                        label: 'Settings',
                        accelerator: 'Cmd+,',
                        click: () => {
                            this.mainWindow?.webContents.send('menu:settings');
                        },
                    },
                    { type: 'separator' },
                    { role: 'services', submenu: [] },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' },
                ],
            });
        }

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    private setupProtocol(): void {
        // Register custom protocol for app resources
        protocol.registerFileProtocol('app', (request, callback) => {
            const url = request.url.substr(6); // Remove 'app://'
            callback({ path: path.normalize(`${__dirname}/${url}`) });
        });
    }
}

// Start the application
new Application();