#!/bin/bash

################################################################################
# Section: Task Archive Features
################################################################################

test_task_archive() {
    print_section "Section: Task Archive"

    # -------------------------------------------------------------------------
    # Setup: create tasks with done/closed status for archive testing
    # -------------------------------------------------------------------------
    print_test "Creating done task for archive testing..."
    local done_output
    done_output=$(run_cli task add "アーカイブテスト用タスク(done)" --json)
    local done_id
    done_id=$(echo "$done_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$done_id" ]; then
        print_error "Failed to create done task for archive test"
        return
    fi
    run_cli task update "$done_id" status done > /dev/null
    print_success "Done task created with ID: $done_id"

    print_test "Creating closed task for archive testing..."
    local closed_output
    closed_output=$(run_cli task add "アーカイブテスト用タスク(closed)" --json)
    local closed_id
    closed_id=$(echo "$closed_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$closed_id" ]; then
        print_error "Failed to create closed task for archive test"
        return
    fi
    run_cli task update "$closed_id" status closed > /dev/null
    print_success "Closed task created with ID: $closed_id"

    # -------------------------------------------------------------------------
    # Dry-run: no matching tasks (date in far past)
    # -------------------------------------------------------------------------
    print_test "task archive --dry-run with no matching tasks (date in far past)..."
    local no_match_output
    no_match_output=$(run_cli task archive --before 2000-01-01 --dry-run)
    if echo "$no_match_output" | grep -q "No tasks matched"; then
        print_success "task archive --dry-run reports no matching tasks when none qualify"
    else
        print_error "Expected 'No tasks matched' message, got: $no_match_output"
    fi

    # -------------------------------------------------------------------------
    # Dry-run: matching tasks exist (future date)
    # -------------------------------------------------------------------------
    print_test "task archive --dry-run with matching tasks (far-future date)..."
    local dry_run_output
    dry_run_output=$(run_cli task archive --before 9999-12-31 --dry-run)
    if echo "$dry_run_output" | grep -q "Dry Run"; then
        print_success "task archive --dry-run shows [Dry Run] header"
    else
        print_error "Expected [Dry Run] header in output, got: $dry_run_output"
    fi

    print_test "Verifying dry-run does not actually archive tasks..."
    local list_after_dryrun
    list_after_dryrun=$(run_cli task list --status done --json)
    local done_count_after_dryrun
    done_count_after_dryrun=$(echo "$list_after_dryrun" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tasks = d.get('tasks', [])
print(len([t for t in tasks if t['id'] == $done_id]))
" 2>/dev/null)
    if [ "$done_count_after_dryrun" = "1" ]; then
        print_success "task archive --dry-run did not archive tasks"
    else
        print_error "task archive --dry-run should not modify tasks"
    fi

    # -------------------------------------------------------------------------
    # Actual archive
    # -------------------------------------------------------------------------
    print_test "task archive with far-future date archives matching tasks..."
    local archive_output
    archive_output=$(run_cli task archive --before 9999-12-31)
    if echo "$archive_output" | grep -q "Archived"; then
        print_success "task archive reports archived tasks"
    else
        print_error "Expected 'Archived' message in output, got: $archive_output"
    fi

    # -------------------------------------------------------------------------
    # task list hides archived tasks by default
    # -------------------------------------------------------------------------
    print_test "task list does not show archived tasks by default..."
    local list_output
    list_output=$(run_cli task list --all --json)
    local archived_visible
    archived_visible=$(echo "$list_output" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tasks = d.get('tasks', [])
found = [t for t in tasks if t['id'] in ($done_id, $closed_id)]
print(len(found))
" 2>/dev/null)
    if [ "$archived_visible" = "0" ]; then
        print_success "task list hides archived tasks by default"
    else
        print_error "task list should not show archived tasks by default (found $archived_visible)"
    fi

    # -------------------------------------------------------------------------
    # task get shows [ARCHIVED]
    # -------------------------------------------------------------------------
    print_test "task get shows [ARCHIVED] for archived task..."
    local get_output
    get_output=$(run_cli task get "$done_id")
    if echo "$get_output" | grep -q "\[ARCHIVED\]"; then
        print_success "task get shows [ARCHIVED] for archived task"
    else
        print_error "task get did not show [ARCHIVED] for task $done_id: $get_output"
    fi

    print_test "task get --json reports is_archived=1 for archived task..."
    local get_json_output
    get_json_output=$(run_cli task get "$done_id" --json)
    local is_archived
    is_archived=$(echo "$get_json_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['is_archived'])" 2>/dev/null)
    if [ "$is_archived" = "1" ]; then
        print_success "task get --json reports is_archived=1"
    else
        print_error "Expected is_archived=1, got: $is_archived"
    fi

    # -------------------------------------------------------------------------
    # task archive --json output structure
    # -------------------------------------------------------------------------
    print_test "Creating another done task for JSON output test..."
    local json_task_output
    json_task_output=$(run_cli task add "JSONアーカイブテスト用タスク" --json)
    local json_task_id
    json_task_id=$(echo "$json_task_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$json_task_id" ]; then
        print_error "Failed to create task for JSON archive test"
    else
        run_cli task update "$json_task_id" status done > /dev/null
        print_success "Done task created with ID: $json_task_id"

        print_test "task archive --json returns valid JSON output..."
        local archive_json_output
        archive_json_output=$(run_cli task archive --before 9999-12-31 --json)
        if echo "$archive_json_output" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert isinstance(d.get('dryRun'), bool)
assert 'beforeDate' in d
assert 'statuses' in d
assert isinstance(d.get('count'), int)
assert isinstance(d.get('tasks'), list)
" 2>/dev/null; then
            print_success "task archive --json returns valid JSON with dryRun, beforeDate, statuses, count, tasks"
        else
            print_error "task archive --json output structure invalid: $archive_json_output"
        fi
    fi
}
