module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }] },
  moduleNameMapper: {
    '^@bundle/shared$': '<rootDir>/../shared/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
