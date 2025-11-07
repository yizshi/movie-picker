// Test setup file
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD_HASH = '$2b$12$testHashForTestingPurposes123456789012345678901234567890';
process.env.TMDB_API_KEY = 'test_api_key';

// Mock console to reduce noise in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn()
};

// Setup and teardown for each test
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});
