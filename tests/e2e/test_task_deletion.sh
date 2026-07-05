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

    # -------------------------------------------------------------------------
    # Dry-run: preview impact without deleting
    # -------------------------------------------------------------------------
    print_test "Creating child task to verify dry-run impact reporting..."
    local child_output
    child_output=$(run_cli task add "削除テスト用子タスク" --parent "$del_task_id" --json)
    local del_child_id
    del_child_id=$(echo "$child_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)

    print_test "task delete --dry-run previews impact without deleting..."
    local dry_run_output
    dry_run_output=$(run_cli task delete "$del_task_id" --dry-run)
    if echo "$dry_run_output" | grep -q "Dry Run"; then
        print_success "task delete --dry-run shows [Dry Run] header"
    else
        print_error "Expected [Dry Run] header in output, got: $dry_run_output"
    fi
    if echo "$dry_run_output" | grep -q "1 child task"; then
        print_success "task delete --dry-run reports child task impact"
    else
        print_error "Expected child task impact in output, got: $dry_run_output"
    fi

    print_test "Verifying dry-run does not actually delete the task..."
    local prev_opts_dry=$-
    set +e
    dry_check_output=$(run_cli task get "$del_task_id" 2>&1)
    [[ "$prev_opts_dry" == *e* ]] && set -e
    if ! echo "$dry_check_output" | grep -q "not found"; then
        print_success "task delete --dry-run did not delete the task"
    else
        print_error "task delete --dry-run should not delete the task"
    fi

    print_test "task delete --dry-run --json returns impact structure..."
    local dry_run_json_output
    dry_run_json_output=$(run_cli task delete "$del_task_id" --dry-run --json)
    if echo "$dry_run_json_output" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('dryRun') is True
assert d.get('success') is False
assert d['impact']['childCount'] == 1
" 2>/dev/null; then
        print_success "task delete --dry-run --json returns valid dryRun impact JSON"
    else
        print_error "task delete --dry-run --json output structure invalid: $dry_run_json_output"
    fi

    # Clean up the child task created for the dry-run check
    if [ -n "$del_child_id" ]; then
        run_cli task delete "$del_child_id" > /dev/null
    fi

    print_test "Deleting task $del_task_id..."
    output=$(run_cli task delete $del_task_id)
    if echo "$output" | grep -q "✓"; then
        print_success "Task $del_task_id deleted successfully"
    else
        print_error "Failed to delete task $del_task_id: $output"
    fi

    print_test "Verifying deleted task no longer exists..."
    local prev_opts=$-
    set +e
    output=$(run_cli task get $del_task_id 2>&1)
    [[ "$prev_opts" == *e* ]] && set -e
    if echo "$output" | grep -q "not found"; then
        print_success "Task $del_task_id confirmed deleted"
    else
        print_error "Task $del_task_id should not exist after deletion"
    fi

    print_test "Deleting non-existent task returns error..."
    prev_opts=$-
    set +e
    output=$(run_cli task delete 99999 2>&1)
    [[ "$prev_opts" == *e* ]] && set -e
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
