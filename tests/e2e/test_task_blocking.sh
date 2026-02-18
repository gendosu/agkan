#!/bin/bash

################################################################################
# Section 6: Task Blocking Features (--blocked-by and --blocks)
################################################################################

BLOCK_BASE_ID1=""
BLOCK_BASE_ID2=""
BLOCK_BASE_ID3=""

test_task_blocking_setup() {
    print_info "Creating base tasks for blocking tests..."
    BLOCK_BASE_ID1=$(run_cli task add "基盤タスク1" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    BLOCK_BASE_ID2=$(run_cli task add "基盤タスク2" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    BLOCK_BASE_ID3=$(run_cli task add "基盤タスク3" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$BLOCK_BASE_ID1" ] || [ -z "$BLOCK_BASE_ID2" ] || [ -z "$BLOCK_BASE_ID3" ]; then
        print_error "Failed to create base tasks for blocking tests"
        return
    fi
    print_success "Base tasks created: $BLOCK_BASE_ID1, $BLOCK_BASE_ID2, $BLOCK_BASE_ID3"
}

test_task_blocking_single_blocked_by() {
    print_test "Creating task with single --blocked-by (blocked by task $BLOCK_BASE_ID1)..."
    output=$(run_cli task add "依存タスクA" --blocked-by "$BLOCK_BASE_ID1")
    if assert_output_contains_all "$output" "Task created successfully" "Blocked By:"; then
        print_success "Task with single --blocked-by created"
    else
        print_error "Failed to create task with single --blocked-by"
    fi
}

test_task_blocking_single_blocks() {
    print_test "Creating task with single --blocks (blocks task $BLOCK_BASE_ID1)..."
    output=$(run_cli task add "ブロックタスクB" --blocks "$BLOCK_BASE_ID1")
    if assert_output_contains_all "$output" "Task created successfully" "Blocking:"; then
        print_success "Task with single --blocks created"
    else
        print_error "Failed to create task with single --blocks"
    fi
}

test_task_blocking_multiple_blocked_by() {
    local blocker_ids="$BLOCK_BASE_ID1,$BLOCK_BASE_ID2"
    print_test "Creating task with multiple --blocked-by (blocked by tasks $blocker_ids)..."
    output=$(run_cli task add "複数依存タスクC" --blocked-by "$blocker_ids")
    if assert_output_contains_all "$output" "Task created successfully" "Blocked By:"; then
        print_success "Task with multiple --blocked-by created"
    else
        print_error "Failed to create task with multiple --blocked-by"
    fi
}

test_task_blocking_multiple_blocks() {
    local blocked_ids="$BLOCK_BASE_ID1,$BLOCK_BASE_ID2"
    print_test "Creating task with multiple --blocks (blocks tasks $blocked_ids)..."
    output=$(run_cli task add "複数ブロックタスクD" --blocks "$blocked_ids")
    if assert_output_contains_all "$output" "Task created successfully" "Blocking:"; then
        print_success "Task with multiple --blocks created"
    else
        print_error "Failed to create task with multiple --blocks"
    fi
}

test_task_blocking_both() {
    print_test "Creating task with both --blocked-by and --blocks (blocked by $BLOCK_BASE_ID1, blocks $BLOCK_BASE_ID2)..."
    output=$(run_cli task add "複合タスクE" --blocked-by "$BLOCK_BASE_ID1" --blocks "$BLOCK_BASE_ID2")
    if assert_output_contains_all "$output" "Task created successfully" "Blocked By:" "Blocking:"; then
        print_success "Task with both --blocked-by and --blocks created"
    else
        print_error "Failed to create task with both options"
    fi
}

test_task_blocking_nonexistent_id() {
    local nonexistent_id=999
    assert_cli_error "Attempting to create task with non-existent --blocked-by ID ($nonexistent_id)" "does not exist" task add "エラータスクF" --blocked-by $nonexistent_id
}

test_task_blocking_invalid_id() {
    local invalid_id="abc"
    assert_cli_error "Attempting to create task with invalid --blocks ID ($invalid_id)" "Invalid" task add "エラータスクG" --blocks $invalid_id
}

test_task_blocking_circular() {
    print_test "Setting up direct circular block test tasks..."
    # Create task A and capture its ID dynamically
    local task_a_id
    task_a_id=$(run_cli task add "循環テストタスクA" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$task_a_id" ]; then
        print_error "Failed to create circular test task A"
        return
    fi

    # Create task B that blocks task A (B→A)
    local task_b_id
    task_b_id=$(run_cli task add "循環テストタスクB" --blocks "$task_a_id" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$task_b_id" ]; then
        print_error "Failed to create circular test task B"
        return
    fi

    print_success "Tasks A ($task_a_id) and B ($task_b_id) created: B→A (B blocks A)"

    # Attempt direct circular: add task with --blocked-by A (A→new) and --blocks B (new→B)
    # Combined with B→A, this creates B→A→new→B cycle
    print_test "Rejecting direct circular block (B→A exists; adding A→new→B creates B→A→new→B cycle)..."
    set +e
    output=$(run_cli task add "循環エラータスク" --blocked-by "$task_a_id" --blocks "$task_b_id" 2>&1)
    exit_code=$?
    set -e

    if [ $exit_code -eq 1 ] && echo "$output" | grep -qiE "(circular|cycle|loop)"; then
        print_success "Direct circular block correctly rejected with exit code 1"
    else
        print_error "Direct circular block not rejected (exit code: $exit_code, output: $output)"
    fi
}

test_task_blocking_indirect_circular() {
    print_test "Setting up indirect circular block test tasks..."
    # Create chain C→B→A (C blocks B, B blocks A)
    local task_a_id
    task_a_id=$(run_cli task add "間接循環タスクA" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$task_a_id" ]; then
        print_error "Failed to create indirect circular test task A"
        return
    fi

    local task_b_id
    task_b_id=$(run_cli task add "間接循環タスクB" --blocks "$task_a_id" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$task_b_id" ]; then
        print_error "Failed to create indirect circular test task B"
        return
    fi

    local task_c_id
    task_c_id=$(run_cli task add "間接循環タスクC" --blocks "$task_b_id" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$task_c_id" ]; then
        print_error "Failed to create indirect circular test task C"
        return
    fi
    print_success "Chain C ($task_c_id)→B ($task_b_id)→A ($task_a_id) created"

    # Attempt indirect circular: add task with --blocked-by A (A→new) and --blocks C (new→C)
    # Combined with C→B→A, this creates C→B→A→new→C cycle
    print_test "Rejecting indirect circular block (C→B→A exists; adding A→new→C creates C→B→A→new→C cycle)..."
    set +e
    output=$(run_cli task add "間接循環エラータスク" --blocked-by "$task_a_id" --blocks "$task_c_id" 2>&1)
    exit_code=$?
    set -e

    if [ $exit_code -eq 1 ] && echo "$output" | grep -qiE "(circular|cycle|loop)"; then
        print_success "Indirect circular block correctly rejected with exit code 1"
    else
        print_error "Indirect circular block not rejected (exit code: $exit_code, output: $output)"
    fi
}

test_task_blocking() {
    print_section "Section 6: Task Blocking Features"

    test_task_blocking_setup
    test_task_blocking_single_blocked_by
    test_task_blocking_single_blocks
    test_task_blocking_multiple_blocked_by
    test_task_blocking_multiple_blocks
    test_task_blocking_both
    test_task_blocking_nonexistent_id
    test_task_blocking_invalid_id
    test_task_blocking_circular
    test_task_blocking_indirect_circular
}
