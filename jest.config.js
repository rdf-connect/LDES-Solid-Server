module.exports = {
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.json',
        },
    },
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    testRegex: '/test/.*\\.ts$',
    moduleFileExtensions: [
        'ts',
        'js',
    ],
    testEnvironment: 'node',
    collectCoverage: true,
    coverageReporters: ['text', 'lcov'],
    coveragePathIgnorePatterns: [
        '/dist/',
        '/node_modules/',
        '/test/',
    ],
    // See https://github.com/matthieubosquet/ts-dpop/issues/13
    moduleNameMapper: {
        '^jose/(.*)$': '<rootDir>/node_modules/jose/dist/node/cjs/$1',
    },
    // Slower machines had problems calling the WebSocket integration callbacks on time
    testTimeout: 60000,
};
