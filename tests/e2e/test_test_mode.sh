#!/bin/bash

################################################################################
# Section 9: Test Mode Configuration
################################################################################

test_test_mode_config_file() {
    print_test "Testing .agkan-test.yml is used in test mode..."

    local saved=$(save_env_vars)
    local test_config=".agkan-test.yml"
    local test_db=".agkan-test/test-config.db"

    unset AGENT_KANBAN_DB_PATH
    echo "path: $test_db" > "$test_config"

    output=$(run_cli task add "テストモード設定テスト")
    if echo "$output" | grep -q "Task created successfully" && [ -f "$test_db" ]; then
        print_success "Test mode correctly uses .agkan-test.yml"
    else
        print_error "Test mode config file not used correctly"
    fi

    rm -rf "$test_db"
    rm -f "$test_config"
    restore_env_vars "$saved"
}

test_test_mode_default_directory() {
    print_test "Testing .agkan-test/ directory is used in test mode..."

    local saved=$(save_env_vars)
    local default_test_db=".agkan-test/data.db"

    unset AGENT_KANBAN_DB_PATH

    if [ -d ".agkan-test" ]; then
        rm -rf ".agkan-test"
    fi

    output=$(run_cli task add "テストディレクトリテスト")
    if echo "$output" | grep -q "Task created successfully" && [ -f "$default_test_db" ]; then
        print_success "Test mode correctly uses .agkan-test/ directory by default"
    else
        print_error "Test mode default directory not used correctly"
    fi

    rm -rf ".agkan-test"
    restore_env_vars "$saved"
}

test_test_mode_env_var_priority() {
    print_test "Testing environment variable still takes priority in test mode..."

    local test_config=".agkan-test.yml"
    echo "path: .agkan-test/config-path.db" > "$test_config"

    output=$(run_cli task add "テストモード環境変数優先テスト")
    if echo "$output" | grep -q "Task created successfully" && [ -f "$TEST_DB_PATH" ]; then
        if [ ! -f ".agkan-test/config-path.db" ]; then
            print_success "Environment variable correctly overrides config in test mode"
        else
            print_error "Environment variable did not override config in test mode"
        fi
    else
        print_error "Failed to create task with env var override in test mode"
    fi

    rm -f "$test_config"
}

test_test_mode_data_isolation() {
    print_test "Testing data isolation between normal and test mode..."

    local saved=$(save_env_vars)
    # Use a dedicated isolation-test path inside the test directory to avoid
    # touching the production .agkan/ directory
    local isolation_db="$TEST_DB_DIR/isolation-test.db"

    output=$(run_cli task add "テストモード専用タスク")
    if ! echo "$output" | grep -q "Task created successfully"; then
        print_error "Failed to create task for data isolation test"
        return
    fi

    # Switch to "other mode" using a separate DB path (never the production path)
    export AGENT_KANBAN_DB_PATH="$isolation_db"
    unset NODE_ENV

    run_cli task add "通常モード専用タスク" > /dev/null 2>&1

    # Switch back to test mode
    restore_env_vars "$saved"

    # Verify test mode data isolation
    test_mode_output=$(run_cli task list)
    if ! echo "$test_mode_output" | grep -q "通常モード専用タスク"; then
        print_success "Data is correctly isolated between normal and test mode"
    else
        print_error "Data isolation failed - normal mode data visible in test mode"
    fi

    # Cleanup isolation test database (inside TEST_DB_DIR, safe to remove)
    rm -f "$isolation_db"
}

test_test_mode_config() {
    print_section "Section 9: Test Mode Configuration"

    test_test_mode_config_file
    test_test_mode_default_directory
    test_test_mode_env_var_priority
    test_test_mode_data_isolation
}
