#!/bin/bash

################################################################################
# agkan E2E Test Suite
#
# This script performs end-to-end testing of the agkan CLI application.
# It tests all major features including tag management, task management,
# filtering, and CASCADE deletion behavior.
#
# Usage:
#   ./test-e2e.sh
#
# Requirements:
#   - Node.js and npm installed
#   - Project built (npm run build)
#   - Clean test database
################################################################################

# Set test environment at the start of the script
export NODE_ENV=test

# Don't exit on error - we handle errors manually
# set -e

# Resolve the directory containing this script for reliable sourcing
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$SCRIPT_DIR/tests/e2e"

# Source shared library (variables, constants, helper functions)
source "$E2E_DIR/lib.sh"

# Source test sections
source "$E2E_DIR/test_build.sh"
source "$E2E_DIR/test_tag_management.sh"
source "$E2E_DIR/test_tag_attachment.sh"
source "$E2E_DIR/test_tag_filtering.sh"
source "$E2E_DIR/test_task_deletion.sh"
source "$E2E_DIR/test_cascade_deletion.sh"
source "$E2E_DIR/test_task_blocking.sh"
source "$E2E_DIR/test_json_output.sh"
source "$E2E_DIR/test_env_var.sh"
source "$E2E_DIR/test_test_mode.sh"

################################################################################
# Main Test Execution
################################################################################

main() {
    print_section "agkan E2E Test Suite"
    print_info "Starting comprehensive end-to-end tests..."

    # Setup
    setup_test_db

    # Run test suites
    test_build
    test_tag_management
    test_tag_attachment
    test_tag_filtering
    test_task_deletion
    test_cascade_deletion
    test_task_blocking
    test_json_output
    test_env_var_config
    test_test_mode_config

    # Cleanup
    cleanup_test_db

    # Print summary
    print_section "Test Summary"
    echo -e "${BLUE}Total tests run: $TESTS_RUN${NC}"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed: $TESTS_PASSED${NC}"
        echo ""
        exit 0
    else
        echo -e "${GREEN}✓ Tests passed: $TESTS_PASSED${NC}"
        echo -e "${RED}✗ Tests failed: $TESTS_FAILED${NC}"
        echo ""
        exit 1
    fi
}

# Run main function
main "$@"
