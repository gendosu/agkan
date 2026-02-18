#!/bin/bash

################################################################################
# Section 7: JSON Output Format
################################################################################

JSON_TASK_ID=""
JSON_TAG_ID=""

test_json_count() {
    output=$(run_cli task count --json)
    assert_json_valid "Testing task count --json" "$output" '.total >= 0' "task count --json returns valid JSON"
}

test_json_add() {
    output=$(run_cli task add "JSONテストタスク" --json)
    if assert_json_valid "Testing task add --json" "$output" '.success == true' "task add --json returns valid JSON with .success == true"; then
        JSON_TASK_ID=$(echo "$output" | jq -r '.task.id')
        print_info "Created task ID: $JSON_TASK_ID"
    fi
}

test_json_list() {
    output=$(run_cli task list --json)
    assert_json_valid "Testing task list --json" "$output" '.tasks | length >= 0' "task list --json returns valid JSON with .tasks array"
}

test_json_get() {
    local task_id=$1
    output=$(run_cli task get "$task_id" --json)
    assert_json_valid "Testing task get --json" "$output" '.task.id' "task get --json returns valid JSON with .task object"
}

test_json_find() {
    output=$(run_cli task find "JSONテスト" --json)
    assert_json_valid "Testing task find --json" "$output" '.tasks | type == "array"' "task find --json returns valid JSON with .tasks array"
}

test_json_update_parent() {
    local task_id=$1

    print_info "Creating parent task for update-parent test..."
    parent_output=$(run_cli task add "親タスク" --json)
    parent_id=$(echo "$parent_output" | jq -r '.task.id')

    output=$(run_cli task update-parent "$task_id" "$parent_id" --json)
    assert_json_valid "Testing task update-parent --json" "$output" '.success == true' "task update-parent --json returns valid JSON with .success == true"
}

test_json_block_list() {
    local task_id=$1

    print_info "Creating blocking task for block list test..."
    blocking_output=$(run_cli task add "ブロックタスク" --blocks "$task_id" --json)

    output=$(run_cli task block list "$task_id" --json)
    assert_json_valid "Testing task block list --json" "$output" 'has("blockedBy") and has("blocking")' "task block list --json returns valid JSON with blockedBy and blocking fields"
}

test_json_tag_list() {
    print_info "Creating tag for tag tests..."
    run_cli tag add "json-test-tag" > /dev/null

    output=$(run_cli tag list --json)
    if assert_json_valid "Testing tag list --json" "$output" '.tags | type == "array"' "tag list --json returns valid JSON with .tags array"; then
        JSON_TAG_ID=$(echo "$output" | jq -r '.tags[-1].id')
    fi
}

test_json_tag_show() {
    local task_id=$1
    local tag_id=$2

    print_info "Attaching tag to task for tag show test..."
    run_cli tag attach "$task_id" "$tag_id" > /dev/null 2>&1

    output=$(run_cli tag show "$task_id" --json)
    assert_json_valid "Testing tag show --json" "$output" '.tags | type == "array"' "tag show --json returns valid JSON with .tags array"
}

test_json_output() {
    print_section "Section 7: JSON Output Format"

    test_json_count
    test_json_add
    test_json_list
    test_json_get "$JSON_TASK_ID"
    test_json_find
    test_json_update_parent "$JSON_TASK_ID"
    test_json_block_list "$JSON_TASK_ID"
    test_json_tag_list
    test_json_tag_show "$JSON_TASK_ID" "$JSON_TAG_ID"
}
