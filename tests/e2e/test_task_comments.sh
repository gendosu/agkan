#!/bin/bash

################################################################################
# Section: Task Comment Features (task comment add/list/delete)
################################################################################

COMMENT_TASK_ID=""

test_task_comments_setup() {
    print_info "Creating base task for comment tests..."
    COMMENT_TASK_ID=$(run_cli task add "Comment Test Task" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$COMMENT_TASK_ID" ]; then
        print_error "Failed to create base task for comment tests"
        return
    fi
    print_success "Base task created: $COMMENT_TASK_ID"
}

test_task_comments_add_with_author() {
    print_test "Adding comment with author to task $COMMENT_TASK_ID..."
    output=$(run_cli task comment add "$COMMENT_TASK_ID" "First comment" --author "alice")
    if assert_output_contains_all "$output" "Comment added successfully" "First comment" "alice"; then
        print_success "Comment with author added successfully"
    else
        print_error "Failed to add comment with author"
    fi
}

test_task_comments_add_anonymous() {
    print_test "Adding anonymous comment to task $COMMENT_TASK_ID..."
    output=$(run_cli task comment add "$COMMENT_TASK_ID" "Anonymous comment")
    if assert_output_contains_all "$output" "Comment added successfully" "Anonymous comment"; then
        print_success "Anonymous comment added successfully"
    else
        print_error "Failed to add anonymous comment"
    fi
}

test_task_comments_list() {
    print_test "Listing comments for task $COMMENT_TASK_ID..."
    output=$(run_cli task comment list "$COMMENT_TASK_ID")
    if assert_output_contains_all "$output" "Comments for task" "First comment" "Anonymous comment" "alice"; then
        print_success "Comment list displays all comments"
    else
        print_error "Comment list incomplete or incorrect"
    fi
}

test_task_comments_list_empty() {
    print_test "Listing comments for a task with no comments..."
    local empty_task_id
    empty_task_id=$(run_cli task add "Empty Comment Task" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])" 2>/dev/null)
    if [ -z "$empty_task_id" ]; then
        print_error "Failed to create empty task for comment test"
        return
    fi
    output=$(run_cli task comment list "$empty_task_id")
    if echo "$output" | grep -q "No comments found"; then
        print_success "Empty comment list handled correctly"
    else
        print_error "Empty comment list not handled correctly"
    fi
}

test_task_comments_delete() {
    print_test "Deleting a comment..."
    # Add a comment to delete
    local add_output
    add_output=$(run_cli task comment add "$COMMENT_TASK_ID" "Comment to delete" --json)
    local comment_id
    comment_id=$(echo "$add_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
    if [ -z "$comment_id" ]; then
        print_error "Failed to create comment for deletion test"
        return
    fi

    output=$(run_cli task comment delete "$comment_id")
    if echo "$output" | grep -q "Comment deleted successfully"; then
        print_success "Comment deleted successfully"
    else
        print_error "Failed to delete comment"
    fi
}

test_task_comments_delete_verifies_removal() {
    print_test "Verifying deleted comment is no longer listed..."
    # Add and immediately delete a comment, then verify it's gone
    local add_output
    add_output=$(run_cli task comment add "$COMMENT_TASK_ID" "Temporary comment for removal" --json)
    local comment_id
    comment_id=$(echo "$add_output" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
    if [ -z "$comment_id" ]; then
        print_error "Failed to create comment for removal verification test"
        return
    fi

    run_cli task comment delete "$comment_id" > /dev/null
    output=$(run_cli task comment list "$COMMENT_TASK_ID")
    if ! echo "$output" | grep -q "Temporary comment for removal"; then
        print_success "Deleted comment no longer appears in list"
    else
        print_error "Deleted comment still appears in list"
    fi
}

test_task_comments_json_output_add() {
    print_test "Adding comment with JSON output..."
    output=$(run_cli task comment add "$COMMENT_TASK_ID" "JSON test comment" --author "bob" --json)
    if echo "$output" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('success') and d['data']['content']=='JSON test comment' and d['data']['author']=='bob' else 1)" 2>/dev/null; then
        print_success "Comment add JSON output is valid and correct"
    else
        print_error "Comment add JSON output invalid or incorrect"
    fi
}

test_task_comments_json_output_list() {
    print_test "Listing comments with JSON output..."
    output=$(run_cli task comment list "$COMMENT_TASK_ID" --json)
    if echo "$output" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('success') and isinstance(d.get('data'), list) else 1)" 2>/dev/null; then
        print_success "Comment list JSON output is valid"
    else
        print_error "Comment list JSON output invalid"
    fi
}

test_task_comments_error_nonexistent_task_add() {
    assert_cli_error "Adding comment to non-existent task" "not found" task comment add 999 "orphan comment"
}

test_task_comments_error_nonexistent_task_list() {
    assert_cli_error "Listing comments for non-existent task" "not found" task comment list 999
}

test_task_comments_error_nonexistent_comment_delete() {
    assert_cli_error "Deleting non-existent comment" "not found" task comment delete 999
}

test_task_comments_error_empty_content() {
    assert_cli_error "Adding comment with empty content" "required" task comment add "$COMMENT_TASK_ID" ""
}

test_task_comments_error_invalid_task_id() {
    assert_cli_error "Adding comment with invalid task ID" "must be a number" task comment add "abc" "test comment"
}

test_task_comments_error_invalid_comment_id() {
    assert_cli_error "Deleting comment with invalid comment ID" "must be a number" task comment delete "abc"
}

test_task_comments_visible_in_task_get() {
    print_test "Verifying comments are visible in task get output..."
    # Add a distinctive comment
    run_cli task comment add "$COMMENT_TASK_ID" "Visible in task get" > /dev/null
    output=$(run_cli task get "$COMMENT_TASK_ID")
    if assert_output_contains_all "$output" "Comments:" "Visible in task get"; then
        print_success "Comments are visible in task get output"
    else
        print_error "Comments not visible in task get output"
    fi
}

test_task_comments() {
    print_section "Section: Task Comment Features"

    test_task_comments_setup
    test_task_comments_add_with_author
    test_task_comments_add_anonymous
    test_task_comments_list
    test_task_comments_list_empty
    test_task_comments_delete
    test_task_comments_delete_verifies_removal
    test_task_comments_json_output_add
    test_task_comments_json_output_list
    test_task_comments_error_nonexistent_task_add
    test_task_comments_error_nonexistent_task_list
    test_task_comments_error_nonexistent_comment_delete
    test_task_comments_error_empty_content
    test_task_comments_error_invalid_task_id
    test_task_comments_error_invalid_comment_id
    test_task_comments_visible_in_task_get
}
