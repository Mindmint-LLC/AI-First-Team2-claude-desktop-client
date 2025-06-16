# TEAM 2: Claude Desktop Client

A powerful desktop application for interacting with multiple LLM providers (Claude, OpenAI, Ollama) using a clean, modern interface built with TypeScript, React, and Electron.

## Features

- **Multi-Provider Support**: Seamlessly switch between Claude, OpenAI, and Ollama
- **Streaming Responses**: Real-time token-by-token display with smooth rendering
- **Conversation Management**: Create, rename, delete, and search conversations
- **Persistent Storage**: SQLite database for offline access and history
- **Cost Tracking**: Monitor token usage and estimated costs per conversation
- **Dark Theme**: Modern, eye-friendly interface
- **Secure API Key Storage**: Platform-native secure storage for API credentials
- **Export/Import**: Save conversations as JSON or Markdown
- **Virtual Scrolling**: Handle hundreds of conversations and messages efficiently

## Architecture

The application follows a strict Model-View-Controller (MVC) architecture:

- **Models**: Data entities, API adapters, SQLite interface
- **Views**: React components for UI presentation
- **Controllers**: Business logic, state coordination, IPC handlers

### Technology Stack

- **Frontend**: TypeScript 5.0+, React 18+, MobX 6+
- **Desktop**: Electron 28+
- **Database**: SQLite3 with better-sqlite3
- **UI Components**: Radix UI primitives
- **Build**: Vite for fast development
- **Testing**: Jest + React Testing Library

## Installation

### Prerequisites

- Node.js 18+ and npm/yarn
- Git

### Setup

1. Clone the repository:
```bash
git clone https://github.com/your-username/claude-desktop-client.git
cd claude-desktop-client
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Configuration

### API Keys

1. Open Settings (Cmd/Ctrl + ,)
2. Select your provider
3. Enter your API key
4. Test connection

### Supported Providers

- **Claude**: Requires Anthropic API key
- **OpenAI**: Requires OpenAI API key
- **Ollama**: No API key needed (local models)

## Usage

### Keyboard Shortcuts

- `Cmd/Ctrl + N`: New conversation
- `Cmd/Ctrl + ,`: Open settings
- `Enter`: Send message
- `Shift + Enter`: New line in message
- `F2`: Rename conversation
- `Delete`: Delete conversation

### Message Formatting

The app supports full Markdown formatting:
- **Bold**: `**text**`
- *Italic*: `*text*`
- `Code`: `` `code` ``
- Code blocks with syntax highlighting
- Lists, quotes, and tables

## Development

### Project Structure

```
src/
├── main/           # Electron main process
│   ├── models/     # Database, API adapters
│   ├── controllers/# IPC handlers, business logic
│   └── index.ts    # Main entry point
├── renderer/       # React application
│   ├── components/ # UI components
│   ├── stores/     # MobX state management
│   └── styles/     # CSS styles
└── shared/         # Shared types and utilities
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format
```

## Building

### For Current Platform

```bash
npm run build
```

### For Specific Platforms

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## Performance

- Application startup: < 2 seconds
- Message rendering: < 50ms
- Scrolling: 60 FPS for hundreds of messages
- Memory usage: < 500MB typical

## Security

- Context isolation enabled
- Sandbox mode for renderer process
- CSP headers enforced
- Input validation at all boundaries
- Secure IPC communication

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run tests and linting
6. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- Documentation: https://github.com/claude-desktop-client/docs
- Issues: https://github.com/claude-desktop-client/issues
- Discussions: https://github.com/claude-desktop-client/discussions