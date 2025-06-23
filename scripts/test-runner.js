#!/usr/bin/env node

/**
 * Comprehensive Test Runner for Claude Desktop Client
 * 
 * This script runs all tests and generates detailed reports for LLM analysis
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestRunner {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                coverage: null
            },
            suites: [],
            errors: [],
            recommendations: []
        };
    }

    async runAllTests() {
        console.log('🧪 Starting Comprehensive Test Suite...\n');
        
        try {
            // Run unit tests
            await this.runUnitTests();
            
            // Run integration tests
            await this.runIntegrationTests();
            
            // Run E2E tests if available
            await this.runE2ETests();
            
            // Generate coverage report
            await this.generateCoverageReport();
            
            // Analyze results and generate recommendations
            this.analyzeResults();
            
            // Generate final report
            this.generateReport();
            
        } catch (error) {
            console.error('❌ Test runner failed:', error.message);
            this.results.errors.push({
                type: 'RUNNER_ERROR',
                message: error.message,
                stack: error.stack
            });
        }
    }

    async runUnitTests() {
        console.log('📋 Running Unit Tests...');
        
        try {
            const output = execSync('npm test -- --verbose --json --outputFile=test-results.json', {
                encoding: 'utf8',
                timeout: 120000 // 2 minutes
            });
            
            // Parse Jest output
            const testResults = this.parseJestOutput();
            this.results.suites.push({
                name: 'Unit Tests',
                type: 'unit',
                ...testResults
            });
            
            console.log(`✅ Unit Tests: ${testResults.passed}/${testResults.total} passed\n`);
            
        } catch (error) {
            console.log('❌ Unit Tests failed');
            this.results.suites.push({
                name: 'Unit Tests',
                type: 'unit',
                status: 'failed',
                error: error.message,
                total: 0,
                passed: 0,
                failed: 1
            });
        }
    }

    async runIntegrationTests() {
        console.log('🔗 Running Integration Tests...');
        
        try {
            // Test database operations
            await this.testDatabaseIntegration();
            
            // Test API adapters
            await this.testAPIIntegration();
            
            // Test IPC communication
            await this.testIPCIntegration();
            
            console.log('✅ Integration Tests completed\n');
            
        } catch (error) {
            console.log('❌ Integration Tests failed');
            this.results.errors.push({
                type: 'INTEGRATION_ERROR',
                message: error.message
            });
        }
    }

    async runE2ETests() {
        console.log('🎭 Running End-to-End Tests...');
        
        try {
            // Test application startup
            await this.testApplicationStartup();
            
            // Test main window creation
            await this.testMainWindow();
            
            console.log('✅ E2E Tests completed\n');
            
        } catch (error) {
            console.log('❌ E2E Tests failed');
            this.results.errors.push({
                type: 'E2E_ERROR',
                message: error.message
            });
        }
    }

    async testDatabaseIntegration() {
        const { Database } = require('../dist/main/models/JsonDatabase');
        const testDbPath = path.join(__dirname, '../test-db.json');
        
        try {
            // Clean up any existing test database
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
            
            const db = new Database(testDbPath);
            
            // Test basic operations
            const conversation = await db.createConversation('Integration Test');
            const message = db.createMessage({
                conversationId: conversation.id,
                role: 'user',
                content: 'Test message',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01
            });
            
            const retrieved = await db.getConversation(conversation.id);
            const messages = db.getMessages(conversation.id);
            
            this.results.suites.push({
                name: 'Database Integration',
                type: 'integration',
                status: 'passed',
                tests: [
                    { name: 'Create Conversation', status: 'passed' },
                    { name: 'Create Message', status: 'passed' },
                    { name: 'Retrieve Conversation', status: 'passed' },
                    { name: 'Retrieve Messages', status: 'passed' }
                ]
            });
            
            // Cleanup
            db.close();
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
            
        } catch (error) {
            this.results.suites.push({
                name: 'Database Integration',
                type: 'integration',
                status: 'failed',
                error: error.message
            });
        }
    }

    async testAPIIntegration() {
        // Test API adapters without making actual API calls
        try {
            const { ClaudeAdapter, OpenAIAdapter, OllamaAdapter } = require('../dist/main/models/APIAdapters');
            
            // Test adapter instantiation
            const claudeAdapter = new ClaudeAdapter();
            const openaiAdapter = new OpenAIAdapter();
            const ollamaAdapter = new OllamaAdapter();
            
            this.results.suites.push({
                name: 'API Integration',
                type: 'integration',
                status: 'passed',
                tests: [
                    { name: 'Claude Adapter Creation', status: 'passed' },
                    { name: 'OpenAI Adapter Creation', status: 'passed' },
                    { name: 'Ollama Adapter Creation', status: 'passed' }
                ]
            });
            
        } catch (error) {
            this.results.suites.push({
                name: 'API Integration',
                type: 'integration',
                status: 'failed',
                error: error.message
            });
        }
    }

    async testIPCIntegration() {
        // Test IPC channel definitions and types
        try {
            const { IPCChannels } = require('../dist/shared/types');
            
            const expectedChannels = [
                'CONVERSATION_CREATE',
                'CONVERSATION_LIST',
                'MESSAGE_SEND',
                'SETTINGS_GET',
                'SETTINGS_UPDATE'
            ];
            
            const missingChannels = expectedChannels.filter(channel => !IPCChannels[channel]);
            
            this.results.suites.push({
                name: 'IPC Integration',
                type: 'integration',
                status: missingChannels.length === 0 ? 'passed' : 'failed',
                tests: expectedChannels.map(channel => ({
                    name: `IPC Channel: ${channel}`,
                    status: IPCChannels[channel] ? 'passed' : 'failed'
                }))
            });
            
        } catch (error) {
            this.results.suites.push({
                name: 'IPC Integration',
                type: 'integration',
                status: 'failed',
                error: error.message
            });
        }
    }

    async testApplicationStartup() {
        // Test that the application can start without errors
        return new Promise((resolve, reject) => {
            const child = spawn('npm', ['start'], {
                stdio: 'pipe',
                timeout: 10000
            });
            
            let output = '';
            child.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            child.stderr.on('data', (data) => {
                output += data.toString();
            });
            
            setTimeout(() => {
                child.kill();
                
                const hasErrors = output.includes('Error') || output.includes('error') || output.includes('failed');
                
                this.results.suites.push({
                    name: 'Application Startup',
                    type: 'e2e',
                    status: hasErrors ? 'failed' : 'passed',
                    output: output.slice(0, 1000) // Limit output size
                });
                
                resolve();
            }, 8000);
        });
    }

    async testMainWindow() {
        // This would require Spectron or similar for real E2E testing
        // For now, just check that the main window files exist
        const mainFiles = [
            'dist/main/index.js',
            'dist/renderer/index.html',
            'dist/renderer/index.js'
        ];
        
        const missingFiles = mainFiles.filter(file => !fs.existsSync(file));
        
        this.results.suites.push({
            name: 'Main Window Files',
            type: 'e2e',
            status: missingFiles.length === 0 ? 'passed' : 'failed',
            tests: mainFiles.map(file => ({
                name: `File exists: ${file}`,
                status: fs.existsSync(file) ? 'passed' : 'failed'
            }))
        });
    }

    parseJestOutput() {
        try {
            if (fs.existsSync('test-results.json')) {
                const results = JSON.parse(fs.readFileSync('test-results.json', 'utf8'));
                return {
                    total: results.numTotalTests || 0,
                    passed: results.numPassedTests || 0,
                    failed: results.numFailedTests || 0,
                    skipped: results.numPendingTests || 0,
                    status: results.success ? 'passed' : 'failed',
                    testResults: results.testResults || []
                };
            }
        } catch (error) {
            console.warn('Could not parse Jest output:', error.message);
        }
        
        return {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            status: 'unknown'
        };
    }

    async generateCoverageReport() {
        try {
            console.log('📊 Generating Coverage Report...');
            execSync('npm run test:coverage', { encoding: 'utf8' });
            
            // Parse coverage report if available
            const coveragePath = 'coverage/coverage-summary.json';
            if (fs.existsSync(coveragePath)) {
                const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                this.results.summary.coverage = coverage.total;
            }
            
        } catch (error) {
            console.warn('Coverage report generation failed:', error.message);
        }
    }

    analyzeResults() {
        console.log('🔍 Analyzing Results...');
        
        // Calculate summary
        this.results.suites.forEach(suite => {
            if (suite.total) {
                this.results.summary.total += suite.total;
                this.results.summary.passed += suite.passed || 0;
                this.results.summary.failed += suite.failed || 0;
                this.results.summary.skipped += suite.skipped || 0;
            }
        });
        
        // Generate recommendations
        this.generateRecommendations();
    }

    generateRecommendations() {
        const recommendations = [];
        
        // Check for failed tests
        const failedSuites = this.results.suites.filter(suite => suite.status === 'failed');
        if (failedSuites.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Test Failures',
                message: `${failedSuites.length} test suite(s) are failing. Address these issues first.`,
                suites: failedSuites.map(s => s.name)
            });
        }
        
        // Check coverage
        if (this.results.summary.coverage && this.results.summary.coverage.lines.pct < 80) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'Code Coverage',
                message: `Code coverage is ${this.results.summary.coverage.lines.pct}%. Aim for 80%+ coverage.`
            });
        }
        
        // Check for errors
        if (this.results.errors.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Runtime Errors',
                message: `${this.results.errors.length} runtime error(s) detected. Review error logs.`
            });
        }
        
        this.results.recommendations = recommendations;
    }

    generateReport() {
        const reportPath = 'test-report.json';
        const humanReadablePath = 'test-report.md';
        
        // Generate JSON report for LLM consumption
        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        
        // Generate human-readable report
        const markdown = this.generateMarkdownReport();
        fs.writeFileSync(humanReadablePath, markdown);
        
        console.log(`📄 Reports generated:`);
        console.log(`   - JSON: ${reportPath}`);
        console.log(`   - Markdown: ${humanReadablePath}`);
        
        // Print summary
        this.printSummary();
    }

    generateMarkdownReport() {
        const { summary, suites, recommendations, errors } = this.results;
        
        let md = `# Test Report\n\n`;
        md += `**Generated:** ${this.results.timestamp}\n\n`;
        
        md += `## Summary\n\n`;
        md += `- **Total Tests:** ${summary.total}\n`;
        md += `- **Passed:** ${summary.passed}\n`;
        md += `- **Failed:** ${summary.failed}\n`;
        md += `- **Skipped:** ${summary.skipped}\n`;
        
        if (summary.coverage) {
            md += `- **Coverage:** ${summary.coverage.lines.pct}%\n`;
        }
        
        md += `\n## Test Suites\n\n`;
        suites.forEach(suite => {
            md += `### ${suite.name} (${suite.type})\n`;
            md += `**Status:** ${suite.status}\n\n`;
            
            if (suite.tests) {
                suite.tests.forEach(test => {
                    md += `- ${test.status === 'passed' ? '✅' : '❌'} ${test.name}\n`;
                });
                md += '\n';
            }
            
            if (suite.error) {
                md += `**Error:** ${suite.error}\n\n`;
            }
        });
        
        if (recommendations.length > 0) {
            md += `## Recommendations\n\n`;
            recommendations.forEach(rec => {
                md += `### ${rec.priority}: ${rec.category}\n`;
                md += `${rec.message}\n\n`;
            });
        }
        
        if (errors.length > 0) {
            md += `## Errors\n\n`;
            errors.forEach(error => {
                md += `### ${error.type}\n`;
                md += `${error.message}\n\n`;
            });
        }
        
        return md;
    }

    printSummary() {
        const { summary } = this.results;
        const passRate = summary.total > 0 ? (summary.passed / summary.total * 100).toFixed(1) : 0;
        
        console.log('\n📊 Test Summary:');
        console.log(`   Total: ${summary.total}`);
        console.log(`   Passed: ${summary.passed} (${passRate}%)`);
        console.log(`   Failed: ${summary.failed}`);
        console.log(`   Skipped: ${summary.skipped}`);
        
        if (summary.coverage) {
            console.log(`   Coverage: ${summary.coverage.lines.pct}%`);
        }
        
        if (this.results.recommendations.length > 0) {
            console.log(`\n🔧 ${this.results.recommendations.length} recommendation(s) generated`);
        }
        
        console.log(`\n${summary.failed === 0 ? '🎉' : '⚠️'} Test run complete!`);
    }
}

// Run if called directly
if (require.main === module) {
    const runner = new TestRunner();
    runner.runAllTests().catch(console.error);
}

module.exports = TestRunner;
