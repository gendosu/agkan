#!/bin/bash

################################################################################
# Section 2: Tag Management Features
################################################################################

test_tag_create() {
    local tag_name=$1
    assert_cli_success "Creating tag '$tag_name'" "Tag created successfully" tag add "$tag_name" > /dev/null
}

test_tag_management_create() {
    # Create multiple tags
    for tag in bug feature urgent; do
        test_tag_create "$tag"
    done
}

test_tag_management_duplicate() {
    assert_cli_error "Attempting to create duplicate tag 'bug'" "already exists" tag add bug
}

test_tag_management_list() {
    print_test "Listing all tags..."
    output=$(run_cli tag list)
    if assert_output_contains_all "$output" "bug" "feature" "urgent"; then
        print_success "Tag list displays all created tags"
    else
        print_error "Tag list incomplete"
    fi
}

test_tag_management_delete() {
    # Delete tag with ID 3 (urgent)
    local tag_id=$URGENT_TAG_ID
    assert_cli_success "Deleting tag 'urgent' (ID: $tag_id)" "Tag deleted successfully" tag delete $tag_id > /dev/null
}

test_tag_management_verify_deletion() {
    print_test "Verifying tag deletion..."
    output=$(run_cli tag list)
    if echo "$output" | grep -q "bug" && echo "$output" | grep -q "feature" && ! echo "$output" | grep -q "urgent"; then
        print_success "Tag 'urgent' no longer in list"
    else
        print_error "Tag deletion verification failed"
    fi
}

test_tag_management() {
    print_section "Section 2: Tag Management Features"

    test_tag_management_create
    test_tag_management_duplicate
    test_tag_management_list
    test_tag_management_delete
    test_tag_management_verify_deletion
}
