#!/bin/bash

################################################################################
# Section 5a: Task Deletion
################################################################################

test_task_deletion() {
    print_section "Section 5a: Task Deletion"

    # Create a temporary task for deletion testing
    print_test "Creating temporary task for deletion testing..."
    output=$(run_cli task add "削除テスト用タスク" --json)
    local del_task_id
    del_task_id=$(echo "$output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$del_task_id" ]; then
        print_error "Failed to create temporary task for deletion test"
        return
    fi
    print_success "Temporary task created with ID: $del_task_id"

    print_test "Deleting task $del_task_id..."
    output=$(run_cli task delete $del_task_id)
    if echo "$output" | grep -q "✓"; then
        print_success "Task $del_task_id deleted successfully"
    else
        print_error "Failed to delete task $del_task_id: $output"
    fi

    print_test "Verifying deleted task no longer exists..."
    set +e
    output=$(run_cli task get $del_task_id 2>&1)
    set -e
    if echo "$output" | grep -q "not found"; then
        print_success "Task $del_task_id confirmed deleted"
    else
        print_error "Task $del_task_id should not exist after deletion"
    fi

    print_test "Deleting non-existent task returns error..."
    set +e
    output=$(run_cli task delete 99999 2>&1)
    set -e
    if echo "$output" | grep -q "not found"; then
        print_success "Correct error for non-existent task deletion"
    else
        print_error "Expected 'not found' error for task 99999"
    fi

    # Create another task for --json deletion test
    output=$(run_cli task add "JSON削除テスト用タスク" --json)
    local del_task_id2
    del_task_id2=$(echo "$output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -n "$del_task_id2" ]; then
        print_test "Deleting task with --json returns JSON..."
        output=$(run_cli task delete $del_task_id2 --json)
        if echo "$output" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('success') else 1)" 2>/dev/null; then
            print_success "task delete --json returns valid JSON with success:true"
        else
            print_error "task delete --json did not return expected JSON: $output"
        fi
    fi
}
