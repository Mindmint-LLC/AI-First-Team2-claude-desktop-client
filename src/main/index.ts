/**
 * File: src/main/index.ts
 * Module: Main Process Entry Point
 * Purpose: Initialize Electron app and manage application lifecycle
 * Usage: Main entry point for Electron main process
 * Contains: Application class, window management, menu setup
 * Dependencies: electron, MainController
 * Iteration: 2
 */

import { app, BrowserWindow, Menu, shell, dialog, protocol } from 'electron';
import { MainController } from './controllers/MainController';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

        // Load the app - ALWAYS load from file, never from localhost
        const indexPath = path.join(__dirname, '../renderer/index.html');

        // Check if the renderer build exists
        if (!fs.existsSync(indexPath)) {
            console.error('Renderer build not found. Please run "npm run build:renderer" first.');
            dialog.showErrorBox(
                'Build Error',
                'Renderer build not found. Please run "npm run build:renderer" first.'
            );
            app.quit();
            return;
        }

        this.mainWindow.loadFile(indexPath);

        // Only open DevTools in development mode
        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.webContents.openDevTools();
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
                                this.mainWindow?.webContents.send('menu:import', {
                                    filePath: result.filePaths[0],
                                });
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
                    {
                        label: 'Quit',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => {
                            app.quit();
                        },
                    },
                ],
            },
            {
                label: 'Edit',
                submenu: [
                    { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                    { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
                    { type: 'separator' },
                    { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                    { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                    { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
                    { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
                ],
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
                    { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' },
                ],
            },
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'About',
                        click: () => {
                            dialog.showMessageBox(this.mainWindow!, {
                                type: 'info',
                                title: 'About Claude Desktop Client',
                                message: 'Claude Desktop Client',
                                detail: 'A powerful desktop application for interacting with multiple LLM providers.\n\nVersion: 1.0.0\nElectron: ' + process.versions.electron,
                                buttons: ['OK'],
                            });
                        },
                    },
                    {
                        label: 'Learn More',
                        click: () => {
                            shell.openExternal('https://github.com/claude-desktop-client');
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
                    { label: 'About ' + app.getName(), role: 'about' },
                    { type: 'separator' },
                    {
                        label: 'Settings',
                        accelerator: 'Cmd+,',
                        click: () => {
                            this.mainWindow?.webContents.send('menu:settings');
                        },
                    },
                    { type: 'separator' },
                    { label: 'Services', role: 'services', submenu: [] },
                    { type: 'separator' },
                    { label: 'Hide ' + app.getName(), accelerator: 'Cmd+H', role: 'hide' },
                    { label: 'Hide Others', accelerator: 'Cmd+Shift+H', role: 'hideOthers' },
                    { label: 'Show All', role: 'unhide' },
                    { type: 'separator' },
                    { label: 'Quit', accelerator: 'Cmd+Q', click: () => app.quit() },
                ],
            });
        }

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    private setupProtocol(): void {
        // Register custom protocol for app resources
        protocol.registerFileProtocol('app', (request, callback) => {
            const url = request.url.replace('app://', '');
            try {
                return callback(path.join(__dirname, url));
            } catch (error) {
                console.error('Failed to register protocol', error);
            }
        });
    }
}

// Initialize application
new Application();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    dialog.showErrorBox('Unexpected Error', error.message);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});