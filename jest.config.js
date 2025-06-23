module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/src'],
    testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/__tests__/**/*.test.tsx',
    ],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                jsx: 'react',
                esModuleInterop: true,
            },
        }],
    },
    moduleNameMapper: {
        '^@main/(.*)$': '<rootDir>/src/main/$1',
        '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
        '^@shared/(.*)$': '<rootDir>/src/shared/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    },
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
    transformIgnorePatterns: [
        'node_modules/(?!(@?react-markdown|@?remark-.*|@?rehype-.*|@?unified|@?micromark.*|@?unist-.*|@?mdast-.*|@?hast-.*|property-information|space-separated-tokens|comma-separated-tokens|character-entities|decode-named-character-reference|bail|is-plain-obj|trough|vfile|vfile-message|zwitch|devlop|longest-streak|markdown-table|ccount|escape-string-regexp)/)'
    ],
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/__tests__/**',
        '!src/main/index.ts',
        '!src/renderer/index.tsx',
    ],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
    testTimeout: 10000,
};