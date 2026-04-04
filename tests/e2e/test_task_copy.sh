#!/bin/bash

################################################################################
# Section: Task Copy Features
################################################################################

test_task_copy() {
    print_section "Section: Task Copy"

    # Create a source task with tags for copy testing
    print_test "Creating source task for copy testing..."
    local src_output
    src_output=$(run_cli task add "コピー元タスク" --json)
    local src_id
    src_id=$(echo "$src_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$src_id" ]; then
        print_error "Failed to create source task for copy test"
        return
    fi
    print_success "Source task created with ID: $src_id"

    # Update body so we can verify it is copied
    run_cli task update "$src_id" body "テスト用ボディ" > /dev/null

    # Create a tag and attach it to source task
    print_test "Creating tag for copy test..."
    local tag_output
    tag_output=$(run_cli tag add "copy-test-tag" --json)
    local tag_id
    tag_id=$(echo "$tag_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
    if [ -n "$tag_id" ]; then
        run_cli tag attach "$src_id" "$tag_id" > /dev/null
        print_success "Tag attached to source task"
    else
        print_error "Failed to create tag for copy test"
    fi

    # Basic copy: title and body should be copied
    print_test "Copying task (basic copy)..."
    local copy_output
    copy_output=$(run_cli task copy "$src_id" --json)
    local copied_id
    copied_id=$(echo "$copy_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$copied_id" ]; then
        print_error "Failed to copy task: $copy_output"
        return
    fi
    print_success "Task copied with new ID: $copied_id"

    print_test "Verifying copied task title matches original..."
    local copied_get
    copied_get=$(run_cli task get "$copied_id" --json)
    local copied_title
    copied_title=$(echo "$copied_get" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['title'])" 2>/dev/null)
    if [ "$copied_title" = "コピー元タスク" ]; then
        print_success "Copied task title matches original"
    else
        print_error "Copied task title mismatch: expected 'コピー元タスク', got '$copied_title'"
    fi

    print_test "Verifying copied task has default status (backlog)..."
    local copied_status
    copied_status=$(echo "$copy_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['status'])" 2>/dev/null)
    if [ "$copied_status" = "backlog" ]; then
        print_success "Copied task has default status 'backlog'"
    else
        print_error "Copied task status mismatch: expected 'backlog', got '$copied_status'"
    fi

    # --status option: copy with specified status
    print_test "Copying task with --status ready..."
    local status_copy_output
    status_copy_output=$(run_cli task copy "$src_id" --status ready --json)
    local status_copied_status
    status_copied_status=$(echo "$status_copy_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['status'])" 2>/dev/null)
    if [ "$status_copied_status" = "ready" ]; then
        print_success "Copied task has status 'ready'"
    else
        print_error "Copied task status mismatch: expected 'ready', got '$status_copied_status'"
    fi

    # Tags copied by default
    print_test "Verifying tags are copied by default..."
    local tags_json
    tags_json=$(echo "$copy_output" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tags', [])))" 2>/dev/null)
    if [ "$tags_json" -gt 0 ] 2>/dev/null; then
        print_success "Tags copied by default"
    else
        print_error "Tags were not copied by default (expected at least 1 tag)"
    fi

    # --no-tags option: tags should not be copied
    print_test "Copying task with --no-tags..."
    local notags_output
    notags_output=$(run_cli task copy "$src_id" --no-tags --json)
    local notags_count
    notags_count=$(echo "$notags_output" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tags', [])))" 2>/dev/null)
    if [ "$notags_count" = "0" ]; then
        print_success "--no-tags: no tags copied"
    else
        print_error "--no-tags: expected 0 tags, got '$notags_count'"
    fi

    # --json flag: JSON output structure
    print_test "Verifying --json output structure..."
    if echo "$copy_output" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('success') == True
assert 'originalId' in d
assert 'task' in d
assert 'tags' in d
" 2>/dev/null; then
        print_success "task copy --json returns valid JSON with success, originalId, task, tags"
    else
        print_error "task copy --json output structure invalid: $copy_output"
    fi

    # Error: non-numeric ID
    print_test "Error on non-numeric task ID..."
    set +e
    local err_output
    err_output=$(run_cli task copy abc 2>&1)
    local err_exit=$?
    set -e
    if [ $err_exit -eq 1 ] && echo "$err_output" | grep -qi "number"; then
        print_success "Non-numeric ID returns error"
    else
        print_error "Expected error for non-numeric ID (exit: $err_exit, output: $err_output)"
    fi

    # Error: invalid status
    print_test "Error on invalid --status value..."
    set +e
    err_output=$(run_cli task copy "$src_id" --status invalid_status 2>&1)
    err_exit=$?
    set -e
    if [ $err_exit -eq 1 ] && echo "$err_output" | grep -qi "status\|valid"; then
        print_success "Invalid status returns error"
    else
        print_error "Expected error for invalid status (exit: $err_exit, output: $err_output)"
    fi

    # Error: non-existent task ID
    print_test "Error on non-existent task ID..."
    set +e
    err_output=$(run_cli task copy 99999 2>&1)
    err_exit=$?
    set -e
    if [ $err_exit -eq 1 ] && echo "$err_output" | grep -qi "not found"; then
        print_success "Non-existent task ID returns 'not found' error"
    else
        print_error "Expected 'not found' error for task 99999 (exit: $err_exit, output: $err_output)"
    fi

    # Cleanup: delete copied tasks
    run_cli task delete "$copied_id" > /dev/null 2>&1 || true
    local status_copied_id
    status_copied_id=$(echo "$status_copy_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    [ -n "$status_copied_id" ] && run_cli task delete "$status_copied_id" > /dev/null 2>&1 || true
    local notags_id
    notags_id=$(echo "$notags_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    [ -n "$notags_id" ] && run_cli task delete "$notags_id" > /dev/null 2>&1 || true
    run_cli task delete "$src_id" > /dev/null 2>&1 || true
}
