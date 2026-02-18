# Testing Guide

This document describes the test environment and testing methods for the agkan project.

## Test Framework

- **Test Framework**: Vitest 4.0.18
- **Test Language**: TypeScript
- **Database**: SQLite (with reset mechanism implemented for testing)

## Environment Setup

### Prerequisites

- Node.js 18 or later
- npm

### Setup Steps

1. Install project dependencies:
```bash
npm install
```

2. Build TypeScript code (recommended before running tests):
```bash
npm run build
```

## Running Tests

### Basic Test Execution

Run all tests:
```bash
npm test
```

### Vitest Options

Run tests in watch mode (automatically reruns on file changes):
```bash
npx vitest
```

Run a specific test file only:
```bash
npx vitest tests/TaskService.test.ts
```

Run tests with coverage report:
```bash
npx vitest --coverage
```

View detailed coverage report:
```bash
# Generate HTML coverage report
npx vitest --coverage

# Open the HTML report in your browser
# Coverage report will be generated in coverage/ directory
# Open coverage/index.html in your browser to view detailed coverage
```

Check coverage thresholds:
```bash
# Run tests with coverage and check thresholds
npm test -- --coverage
# This will fail if coverage is below 80% threshold
```

## Test File Structure

### Main Test File

**File Path**: `tests/TaskService.test.ts`

This file contains 20 test cases that comprehensively test all functionality of the TaskService class.

### Dependency Injection Pattern

All service classes (TaskService, TagService, TaskBlockService, TaskTagService, AttachmentService) support dependency injection for improved testability. This allows tests to inject mock database instances instead of using the real database connection.

**Constructor Injection with Default Values**:
```typescript
constructor(private db: Database = getDatabase()) {
  // Service implementation
}
```

**Benefits**:
- Tests can provide mock database instances
- Production code uses the default real database
- No changes needed to existing CLI code (100% backward compatibility)
- Easier to write isolated unit tests

**Example Usage in Tests**:
```typescript
import { createMockDatabase } from './utils/mock-database';

describe('TaskService', () => {
  let mockDb: Database;
  let taskService: TaskService;

  beforeEach(() => {
    mockDb = createMockDatabase();
    taskService = new TaskService(mockDb);
  });

  it('should create a task', () => {
    const task = taskService.createTask({ title: 'Test' });
    expect(task).toBeDefined();
  });
});
```

## Test Cases Overview

### 1. createTask (Task Creation) Tests - 3 Cases

- **Basic task creation test**: Creates a task with only the title specified and verifies that auto-generated fields (id, created_at, updated_at) are correctly set
- **Task creation with all fields test**: Creates a task by specifying title, body, author, and status, and verifies that all values are correctly saved
- **Error handling test for empty required field (title)**: Confirms that a task can be created even with an empty title string (current implementation behavior)

### 2. getTask (Task Retrieval) Tests - 2 Cases

- **Retrieve existing task by ID test**: Creates a task and retrieves it by ID, verifying that all fields are correctly retrieved
- **Retrieve non-existent task by ID test**: Attempts to retrieve a non-existent task ID and verifies that null is returned

### 3. listTasks (Task List Retrieval) Tests - 4 Cases

- **Get all tasks without filters test**: Creates multiple tasks and verifies that all are returned in descending order by created_at (newest first)
- **Filter by status test**: Creates tasks with different statuses and verifies that filtering by a specific status returns only matching tasks
- **Filter by author test**: Creates tasks by different authors and verifies that filtering by a specific author returns only matching tasks
- **Combined filter (status + author) test**: Verifies that filtering with both status and author conditions (AND operation) works correctly

### 4. updateTask (Task Update) Tests - 7 Cases

- **Update title test**: Updates only the title and verifies that other fields remain unchanged
- **Update body test**: Updates only the body and verifies that other fields remain unchanged
- **Update author test**: Updates only the author and verifies that other fields remain unchanged
- **Update status test**: Updates only the status and verifies that other fields remain unchanged
- **Update multiple fields test**: Updates title, body, and status simultaneously and verifies all are correctly updated
- **Update non-existent task test**: Attempts to update a non-existent task ID and verifies that null is returned
- **Update with null values test**: Sets body and author to null and verifies that null values are correctly saved

### 5. deleteTask (Task Deletion) Tests - 2 Cases

- **Delete existing task test**: Creates and deletes a task, verifying that deletion succeeds (returns true) and subsequent retrieval returns null
- **Delete non-existent task test**: Attempts to delete a non-existent task ID and verifies that false (deletion failed) is returned

### 6. Integration Scenario Tests - 2 Cases

- **Full task lifecycle test**: Verifies the complete flow from creation (backlog) through status transitions (ready → in_progress → done → closed), information addition (body, author), and deletion
- **Multiple tasks management test**: Creates 10 tasks and performs filtering, updates, and deletions, verifying that operations don't interfere with each other

## Test Characteristics

### Database Reset

Before each test case, the database is automatically reset by the `beforeEach` hook. This ensures independence between tests.

```typescript
beforeEach(() => {
  resetDatabase();
  taskService = new TaskService();
});
```

### Test Database

- Tests use an in-memory or dedicated test database separate from production data
- The `resetDatabase()` function (in `src/db/reset.ts`) ensures a clean state at the start of each test

### Coverage

The 20 currently implemented test cases comprehensively cover the following functionality:

- **CRUD Operations**: All basic operations - Create, Read (retrieval and listing), Update, and Delete
- **Filtering**: Filtering by status, author, and combined conditions
- **Edge Cases**: Handling of non-existent IDs, null values, and empty strings
- **Integration Scenarios**: Complex operation flows based on real-world usage

## Troubleshooting

### When Tests Fail

1. **Verify dependencies**:
```bash
npm install
```

2. **Check TypeScript build errors**:
```bash
npm run build
```

3. **Delete database file**:
```bash
rm -rf data/agkan.db
```

4. **Verify Node.js version**:
```bash
node --version  # Should be 18 or later
```

### Common Issues

- **Database lock error**: If another process is using the database, terminate that process
- **Permission error**: Verify that the `data/` directory has write permissions

## Running Tests in CI/CD Environment

In CI/CD environments, execute the following commands in order:

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

## Reference

- Test file: `tests/TaskService.test.ts`
- Database reset function: `src/db/reset.ts`
- TaskService class: `src/services/TaskService.ts`
- Vitest official documentation: https://vitest.dev/

## Example Test Results

When all tests pass, you will see output similar to the following:

```
 ✓ tests/TaskService.test.ts (20)
   ✓ TaskService (20)
     ✓ createTask (3)
       ✓ Basic task creation test
       ✓ Task creation with all fields test
       ✓ Error handling test for empty required field (title)
     ✓ getTask (2)
       ✓ Retrieve existing task by ID test
       ✓ Retrieve non-existent task by ID test
     ✓ listTasks (4)
       ✓ Get all tasks without filters test
       ✓ Filter by status test
       ✓ Filter by author test
       ✓ Combined filter (status + author) test
     ✓ updateTask (7)
       ✓ Update title test
       ✓ Update body test
       ✓ Update author test
       ✓ Update status test
       ✓ Update multiple fields test
       ✓ Update non-existent task test
       ✓ Update with null values test
     ✓ deleteTask (2)
       ✓ Delete existing task test
       ✓ Delete non-existent task test
     ✓ Integration Scenario Tests (2)
       ✓ Full task lifecycle test
       ✓ Multiple tasks management test

 Test Files  1 passed (1)
      Tests  20 passed (20)
```
