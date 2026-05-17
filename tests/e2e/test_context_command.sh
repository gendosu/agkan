#!/bin/bash

################################################################################
# Section: agkan context command and Claude SessionStart hook E2E Tests
################################################################################

test_context_command() {
    print_section "Section: agkan context command and Claude SessionStart hook"

    local tmp_dir
    tmp_dir=$(mktemp -d)
    local original_db_path="$AGKAN_DB_PATH"

    # Use isolated directory and DB for init tests
    export AGKAN_DB_PATH="$tmp_dir/.agkan-test/data.db"

    (
        cd "$tmp_dir" || exit 1

        # Run agkan init in the tmp directory
        run_cli init > /dev/null 2>&1

        # Test 1: .claude/settings.local.json created
        if [ ! -f ".claude/settings.local.json" ]; then
            print_error "agkan init should create .claude/settings.local.json"
        else
            print_success ".claude/settings.local.json created by agkan init"
        fi

        # Test 2: SessionStart hook contains agkan context --hook
        if ! grep -q "agkan context --hook" ".claude/settings.local.json"; then
            print_error "settings.local.json missing agkan SessionStart hook"
        else
            print_success "settings.local.json contains agkan SessionStart hook"
        fi

        # Test 3: Idempotency - run init again, hook should not be duplicated
        run_cli init > /dev/null 2>&1
        hook_count=$(grep -c "agkan context --hook" ".claude/settings.local.json" || true)
        if [ "$hook_count" -ne 1 ]; then
            print_error "agkan init is not idempotent: hook appears $hook_count times (expected 1)"
        else
            print_success "agkan init is idempotent (hook appears exactly once)"
        fi
    )

    # Restore DB path
    export AGKAN_DB_PATH="$original_db_path"

    # Cleanup
    rm -rf "$tmp_dir"

    # Test 4: agkan context plain output
    local context_output
    context_output=$(run_cli context 2>&1)
    if echo "$context_output" | grep -q "agkan task list"; then
        print_success "agkan context outputs expected plain text guide"
    else
        print_error "agkan context plain output missing expected content"
        echo "Got: $context_output"
    fi

    # Test 5: agkan context --hook output
    local hook_output
    hook_output=$(run_cli context --hook 2>&1)
    if echo "$hook_output" | grep -q '"additionalContext"'; then
        print_success "agkan context --hook outputs JSON with additionalContext"
    else
        print_error "agkan context --hook output missing additionalContext"
        echo "Got: $hook_output"
    fi
}
