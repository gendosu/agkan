#!/bin/bash

################################################################################
# Section: Assignees Field Tests
################################################################################

ASSIGNEES_TASK_ID=""

test_assignees_add() {
    print_info "Creating task with --assignees..."
    output=$(run_cli task add "Assigneesテスト" --assignees "user1,user2" --json)
    if assert_json_valid "task add --assignees stores assignees" "$output" '.task.assignees == "user1,user2"' "task add --assignees saves assignees correctly"; then
        ASSIGNEES_TASK_ID=$(echo "$output" | jq -r '.task.id')
        print_info "Created task ID: $ASSIGNEES_TASK_ID"
    fi
}

test_assignees_get() {
    local task_id=$1
    output=$(run_cli task get "$task_id")
    assert_output_contains "$output" "Assignees:" "task get shows Assignees label" "task get does not show Assignees label"
    assert_output_contains "$output" "user1,user2" "task get shows assignees value" "task get does not show assignees value"
}

test_assignees_get_json() {
    local task_id=$1
    output=$(run_cli task get "$task_id" --json)
    assert_json_valid "task get --json includes assignees" "$output" '.task.assignees == "user1,user2"' "task get --json includes assignees field"
}

test_assignees_list() {
    output=$(run_cli task list)
    assert_output_contains "$output" "user1,user2" "task list shows assignees value" "task list does not show assignees value"
}

test_assignees_list_json() {
    output=$(run_cli task list --json)
    assert_json_valid "task list --json includes assignees" "$output" '.tasks[] | select(.assignees == "user1,user2")' "task list --json includes assignees field"
}

test_assignees_update() {
    local task_id=$1
    output=$(run_cli task update "$task_id" assignees "alice,bob" --json)
    assert_json_valid "task update assignees" "$output" '.task.assignees == "alice,bob"' "task update can change assignees"
}

test_assignees_update_verify_get() {
    local task_id=$1
    print_info "Verifying updated assignees via task get..."
    output=$(run_cli task get "$task_id")
    assert_output_contains "$output" "alice,bob" "task get shows updated assignees after update" "task get does not show updated assignees after update"

    output=$(run_cli task get "$task_id" --json)
    assert_json_valid "task get --json shows updated assignees" "$output" '.task.assignees == "alice,bob"' "task get --json shows updated assignees after update"
}

test_assignees_update_verify_list() {
    print_info "Verifying updated assignees via task list..."
    output=$(run_cli task list)
    assert_output_contains "$output" "alice,bob" "task list shows updated assignees after update" "task list does not show updated assignees after update"

    output=$(run_cli task list --json)
    assert_json_valid "task list --json shows updated assignees" "$output" '.tasks[] | select(.assignees == "alice,bob")' "task list --json shows updated assignees after update"
}

test_assignees_add_json() {
    output=$(run_cli task add "JSON Assigneesテスト" --assignees "carol" --json)
    assert_json_valid "task add --json includes assignees" "$output" '.task.assignees == "carol"' "task add --json includes assignees field"
}

test_assignees_validation() {
    local long_assignees
    long_assignees=$(python3 -c "print('a' * 501)")
    assert_cli_error "task add --assignees 501 chars fails" "500" task add "バリデーションテスト" --assignees "$long_assignees"
}

test_assignees_update_validation() {
    local task_id=$1
    local long_assignees
    long_assignees=$(python3 -c "print('a' * 501)")
    assert_cli_error "task update assignees 501 chars fails" "500" task update "$task_id" assignees "$long_assignees"
}

test_assignees() {
    print_section "Section: Assignees Field"

    test_assignees_add
    if [ -n "$ASSIGNEES_TASK_ID" ]; then
        test_assignees_get "$ASSIGNEES_TASK_ID"
        test_assignees_get_json "$ASSIGNEES_TASK_ID"
        test_assignees_list
        test_assignees_list_json
        test_assignees_update "$ASSIGNEES_TASK_ID"
        test_assignees_update_verify_get "$ASSIGNEES_TASK_ID"
        test_assignees_update_verify_list
        test_assignees_update_validation "$ASSIGNEES_TASK_ID"
    fi
    test_assignees_add_json
    test_assignees_validation
}
