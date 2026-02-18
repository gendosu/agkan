#!/bin/bash

################################################################################
# Section 3: Tag Attachment Features
################################################################################

test_tag_attachment_create_tasks() {
    # Task IDs will be 1 and 2 (sequential creation)
    assert_cli_success "Creating task 'ログイン機能実装'" "Task created successfully" task add "ログイン機能実装" > /dev/null
    assert_cli_success "Creating task 'バグ修正'" "Task created successfully" task add "バグ修正" > /dev/null
}

test_tag_attachment_attach() {
    local task_id_1=$FIRST_TASK_ID
    local task_id_2=$SECOND_TASK_ID
    local tag_bug_id=$BUG_TAG_ID
    local tag_feature_id=$FEATURE_TAG_ID

    assert_cli_success "Attaching tag 'bug' (ID:$tag_bug_id) to task $task_id_1" "Tag attached successfully" tag attach $task_id_1 $tag_bug_id > /dev/null
    assert_cli_success "Attaching tag 'feature' (ID:$tag_feature_id) to task $task_id_1 (multiple tags)" "Tag attached successfully" tag attach $task_id_1 $tag_feature_id > /dev/null
    assert_cli_success "Attaching tag 'bug' (ID:$tag_bug_id) to task $task_id_2 (same tag to multiple tasks)" "Tag attached successfully" tag attach $task_id_2 $tag_bug_id > /dev/null
}

test_tag_attachment_duplicate() {
    local task_id=$FIRST_TASK_ID
    local tag_id=$BUG_TAG_ID
    assert_cli_error "Attempting to attach duplicate tag to task $task_id" "already has this tag" tag attach $task_id $tag_id
}

test_tag_attachment_show() {
    local task_id=$FIRST_TASK_ID
    print_test "Showing tags for task $task_id..."
    output=$(run_cli tag show $task_id)
    if assert_output_contains_all "$output" "bug" "feature"; then
        print_success "Task $task_id shows both tags"
    else
        print_error "Task $task_id tag display incomplete"
    fi
}

test_tag_attachment_detach() {
    local task_id=$FIRST_TASK_ID
    local tag_id=$FEATURE_TAG_ID
    assert_cli_success "Detaching tag 'feature' (ID:$tag_id) from task $task_id" "Tag detached successfully" tag detach $task_id $tag_id > /dev/null
}

test_tag_attachment_verify_get_display() {
    local task_id=$FIRST_TASK_ID
    print_test "Verifying tags display in 'task get' command..."
    output=$(run_cli task get $task_id)
    if assert_output_contains_all "$output" "Tags:" "bug"; then
        print_success "Task get command displays tags"
    else
        print_error "Task get command tag display failed"
    fi
}

test_tag_attachment() {
    print_section "Section 3: Tag Attachment Features"

    test_tag_attachment_create_tasks
    test_tag_attachment_attach
    test_tag_attachment_duplicate
    test_tag_attachment_show
    test_tag_attachment_detach
    test_tag_attachment_verify_get_display
}
