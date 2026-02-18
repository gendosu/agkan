#!/bin/bash

################################################################################
# Section 5b: CASCADE Deletion Features
################################################################################

test_cascade_deletion_delete_tag() {
    local tag_id=$BUG_TAG_ID
    assert_cli_success "Deleting tag 'bug' (ID:$tag_id, attached to task $FIRST_TASK_ID and $SECOND_TASK_ID)" "Tag deleted successfully" tag delete $tag_id > /dev/null
}

test_cascade_deletion_verify_tasks_exist() {
    print_test "Verifying tasks still exist after tag deletion..."
    output=$(run_cli task list)
    if assert_output_contains_all "$output" "ログイン機能実装" "バグ修正"; then
        print_success "Tasks remain after tag deletion (CASCADE correct)"
    else
        print_error "Tasks should remain after tag deletion"
    fi
}

test_cascade_deletion_verify_tag_removed() {
    local task_id_1=$FIRST_TASK_ID
    local task_id_2=$SECOND_TASK_ID

    print_test "Verifying tag removed from task $task_id_1..."
    output=$(run_cli task get $task_id_1)
    if ! echo "$output" | grep -q "bug"; then
        print_success "Tag 'bug' removed from task $task_id_1 via CASCADE"
    else
        print_error "Tag 'bug' should be removed from task $task_id_1"
    fi

    print_test "Verifying tag removed from task $task_id_2..."
    output=$(run_cli task get $task_id_2)
    if ! echo "$output" | grep -q "bug"; then
        print_success "Tag 'bug' removed from task $task_id_2 via CASCADE"
    else
        print_error "Tag 'bug' should be removed from task $task_id_2"
    fi
}

test_cascade_deletion_verify_remaining_tags() {
    print_test "Verifying only 'feature' tag remains..."
    output=$(run_cli tag list)
    if echo "$output" | grep -q "feature" && ! echo "$output" | grep -q "bug"; then
        print_success "Only 'feature' tag remains in database"
    else
        print_error "Expected only 'feature' tag to remain"
    fi
}

test_cascade_deletion() {
    print_section "Section 5b: CASCADE Deletion Features"

    test_cascade_deletion_delete_tag
    test_cascade_deletion_verify_tasks_exist
    test_cascade_deletion_verify_tag_removed
    test_cascade_deletion_verify_remaining_tags
}
