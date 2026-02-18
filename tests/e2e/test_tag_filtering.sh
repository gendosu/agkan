#!/bin/bash

################################################################################
# Section 4: Tag Filtering Features
################################################################################

test_tag_filtering_setup() {
    local task_id=$FIRST_TASK_ID
    local tag_id=$FEATURE_TAG_ID
    print_info "Re-attaching tag 'feature' to task $task_id for filtering tests..."
    run_cli tag attach $task_id $tag_id > /dev/null 2>&1
}

test_tag_filtering_single() {
    local tag_id=$BUG_TAG_ID
    print_test "Filtering tasks by single tag (bug)..."
    output=$(run_cli task list --tag $tag_id)
    if assert_output_contains_all "$output" "ログイン機能実装" "バグ修正"; then
        print_success "Single tag filter returns correct tasks"
    else
        print_error "Single tag filter failed"
    fi
}

test_tag_filtering_multiple() {
    local tag_ids="$BUG_TAG_ID,$FEATURE_TAG_ID"
    print_test "Filtering tasks by multiple tags (bug OR feature)..."
    output=$(run_cli task list --tag $tag_ids)
    if assert_output_contains_all "$output" "ログイン機能実装" "バグ修正"; then
        print_success "Multiple tag filter (OR condition) works"
    else
        print_error "Multiple tag filter failed"
    fi
}

test_tag_filtering_with_status() {
    local tag_id=$BUG_TAG_ID
    local status="backlog"
    print_test "Filtering tasks by tag and status (bug + $status)..."
    output=$(run_cli task list --tag $tag_id --status $status)
    if assert_output_contains_all "$output" "ログイン機能実装" "バグ修正"; then
        print_success "Tag + status filter combination works"
    else
        print_error "Tag + status filter combination failed"
    fi
}

test_tag_filtering_list_display() {
    print_test "Verifying tags display in 'task list' command..."
    output=$(run_cli task list)
    if echo "$output" | grep -q "Tags:"; then
        print_success "Task list command displays tags"
    else
        print_error "Task list command tag display failed"
    fi
}

test_tag_filtering() {
    print_section "Section 4: Tag Filtering Features"

    test_tag_filtering_setup
    test_tag_filtering_single
    test_tag_filtering_multiple
    test_tag_filtering_with_status
    test_tag_filtering_list_display
}
