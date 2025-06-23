/**
 * File: scripts/dev.js
 * Module: Development Helper Script
 * Purpose: Ensure renderer is built before starting Electron in dev mode
 * Usage: Called by npm run dev
 * Contains: Build check and dev server coordination
 * Dependencies: child_process, fs
 * Iteration: 2
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const RENDERER_BUILD_PATH = path.join(__dirname, '../dist/renderer/index.html');

async function startDev() {
    console.log('🚀 Starting Claude Desktop Client development environment...\n');

    // Check if renderer build exists
    if (!fs.existsSync(RENDERER_BUILD_PATH)) {
        console.log('📦 Building renderer for the first time...');
        await runCommand('npm', ['run', 'build:renderer']);
        console.log('✅ Renderer build complete!\n');
    }

    // Start concurrent processes
    console.log('🔧 Starting development processes...\n');

    // Start TypeScript compiler for main process
    const mainProcess = spawn('npx', ['tsc', '-w', '-p', 'tsconfig.main.json'], {
        stdio: 'inherit',
        shell: true
    });

    // Start Vite dev server for renderer
    const rendererProcess = spawn('npx', ['vite', '--port', '3000'], {
        stdio: 'inherit',
        shell: true
    });

    // Wait a bit for initial builds and dev server startup
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Start Electron
    const electronProcess = spawn('npx', ['electron', '.'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, NODE_ENV: 'development' }
    });

    // Handle process termination
    const cleanup = () => {
        console.log('\n🛑 Shutting down development environment...');
        mainProcess.kill();
        rendererProcess.kill();
        electronProcess.kill();
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            stdio: 'inherit',
            shell: true
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with code ${code}`));
            }
        });
    });
}

// Start development
startDev().catch(err => {
    console.error('❌ Development startup failed:', err);
    process.exit(1);
});