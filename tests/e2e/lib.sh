#!/bin/bash

################################################################################
# agkan E2E Test Library
#
# Common variables, constants, and helper functions shared across all E2E tests.
# Source this file at the beginning of each test file.
################################################################################

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Database path for testing - MUST use separate directory from production
TEST_DB_PATH=".agkan-test/test-e2e.db"
TEST_DB_DIR=".agkan-test"

# Safety check: Ensure we never accidentally target production database
PROD_DB_DIR=".agkan"
if [ "$TEST_DB_DIR" = "$PROD_DB_DIR" ]; then
    echo "ERROR: TEST_DB_DIR must not equal production directory!"
    exit 1
fi

# Test data IDs (sequential creation assumed)
readonly FIRST_TASK_ID=1
readonly SECOND_TASK_ID=2
readonly THIRD_TASK_ID=3
readonly BUG_TAG_ID=1
readonly FEATURE_TAG_ID=2
readonly URGENT_TAG_ID=3

# Cleanup safety thresholds
readonly MAX_SAFE_TASK_COUNT=2

################################################################################
# Helper Functions
################################################################################

print_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_test() {
    echo -e "${YELLOW}[TEST] $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    ((TESTS_FAILED++))
    ((TESTS_RUN++))
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Setup test database
setup_test_db() {
    print_info "Setting up test database..."

    # Remove existing test database
    if [ -d "$TEST_DB_DIR" ]; then
        rm -rf "$TEST_DB_DIR"
    fi

    # Create test database directory
    mkdir -p "$TEST_DB_DIR"

    # Set environment variable for test database
    export AGENT_KANBAN_DB_PATH="$TEST_DB_PATH"
    export NODE_ENV=test

    print_success "Test database configured at: $TEST_DB_PATH"
}

# Cleanup test database
cleanup_test_db() {
    print_info "Cleaning up test database..."
    # Safety check: Only delete test database directory, never production
    if [ "$TEST_DB_DIR" = ".agkan-test" ] && [ -d "$TEST_DB_DIR" ]; then
        rm -rf "$TEST_DB_DIR"
    elif [ "$TEST_DB_DIR" != ".agkan-test" ]; then
        print_error "CRITICAL: TEST_DB_DIR is not set to test directory!"
        print_error "Refusing to delete: $TEST_DB_DIR"
        exit 1
    fi
    unset AGENT_KANBAN_DB_PATH
    # Keep NODE_ENV=test until end of script to prevent fallback to production
    print_success "Test database cleaned up"
}

# Save current environment variables
save_env_vars() {
    echo "$AGENT_KANBAN_DB_PATH|$NODE_ENV"
}

# Restore environment variables from saved state
restore_env_vars() {
    local saved=$1
    IFS='|' read -r db_path node_env <<< "$saved"
    export AGENT_KANBAN_DB_PATH="$db_path"
    export NODE_ENV="$node_env"
}

# Execute CLI command and capture output
run_cli() {
    npx . "$@" 2>&1
}

# Assert CLI command succeeds with expected output
assert_cli_success() {
    local test_name=$1
    local expected_output=$2
    shift 2

    print_test "$test_name"
    local output
    output=$(run_cli "$@")

    if echo "$output" | grep -q "$expected_output"; then
        print_success "$test_name"
        echo "$output"
    else
        print_error "$test_name"
        echo "$output"
    fi
}

# Assert CLI command output contains expected string
assert_output_contains() {
    local output=$1
    local expected=$2
    local success_msg=$3
    local error_msg=$4

    if echo "$output" | grep -q "$expected"; then
        print_success "$success_msg"
    else
        print_error "$error_msg"
    fi
}

# Assert CLI command fails with expected error
assert_cli_error() {
    local test_name=$1
    local expected_error=$2
    shift 2

    print_test "$test_name"
    local output
    local exit_code
    set +e
    output=$(run_cli "$@" 2>&1)
    exit_code=$?
    set -e

    if [ $exit_code -eq 1 ] && echo "$output" | grep -qE "$expected_error"; then
        print_success "$test_name"
        return 0
    else
        print_error "$test_name (exit code: $exit_code)"
        return 1
    fi
}

# Assert multiple conditions in output
assert_output_contains_all() {
    local output=$1
    shift
    local patterns=("$@")

    for pattern in "${patterns[@]}"; do
        if ! echo "$output" | grep -q "$pattern"; then
            return 1
        fi
    done
    return 0
}

# Assert JSON output is valid and matches jq query
assert_json_valid() {
    local test_name=$1
    local output=$2
    local jq_query=$3
    local success_msg=${4:-"$test_name returns valid JSON"}

    print_test "$test_name"
    if echo "$output" | jq -e "$jq_query" > /dev/null 2>&1; then
        print_success "$success_msg"
        return 0
    else
        print_error "$test_name failed"
        return 1
    fi
}
