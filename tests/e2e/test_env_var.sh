#!/bin/bash

################################################################################
# Section 8: Environment Variable Configuration
################################################################################

test_env_var_priority() {
    print_test "Testing environment variable takes priority over config file..."

    local config_path=".agkan-test.yml"
    echo "path: .agkan-test/config-db.db" > "$config_path"

    # Environment variable should override config file
    output=$(run_cli task add "環境変数優先テスト")
    if echo "$output" | grep -q "Task created successfully" && [ -f "$TEST_DB_PATH" ]; then
        print_success "Environment variable correctly overrides config file"
    else
        print_error "Failed to create task with env var override"
    fi

    rm -f "$config_path"
}

test_env_var_absolute_path() {
    print_test "Testing absolute path in environment variable..."

    local saved=$(save_env_vars)
    local abs_path="$(pwd)/.agkan/abs-test.db"
    export AGENT_KANBAN_DB_PATH="$abs_path"

    output=$(run_cli task add "絶対パステスト")
    if echo "$output" | grep -q "Task created successfully" && [ -f "$abs_path" ]; then
        print_success "Absolute path in environment variable works correctly"
    else
        print_error "Absolute path in environment variable failed"
    fi

    restore_env_vars "$saved"
    rm -f "$abs_path"
}

test_env_var_fallback() {
    print_test "Testing fallback to default path when env var is unset..."

    local saved=$(save_env_vars)
    local config_path=".agkan-test.yml"
    local fallback_db_path=".agkan-test/fallback-test.db"

    unset AGENT_KANBAN_DB_PATH
    echo "path: $fallback_db_path" > "$config_path"

    output=$(run_cli task add "フォールバックテスト")
    if echo "$output" | grep -q "Task created successfully" && [ -f "$fallback_db_path" ]; then
        print_success "Fallback to config file works when env var is unset"
    else
        print_error "Fallback to config file failed"
    fi

    rm -rf "$fallback_db_path"
    rm -f "$config_path"
    restore_env_vars "$saved"
}

test_env_var_node_env() {
    print_test "Verifying NODE_ENV=test is set..."
    if [ "$NODE_ENV" = "test" ]; then
        print_success "NODE_ENV is correctly set to 'test'"
    else
        print_error "NODE_ENV should be set to 'test' (current: $NODE_ENV)"
    fi
}

test_env_var_config() {
    print_section "Section 8: Environment Variable Configuration"

    test_env_var_priority
    test_env_var_absolute_path
    test_env_var_fallback
    test_env_var_node_env
}
