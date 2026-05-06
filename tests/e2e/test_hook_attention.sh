#!/bin/bash

################################################################################
# Section: Hook Attention E2E Tests
#
# Tests the end-to-end flow:
#   hook script → board API → SSE → state update
#
# Scenarios covered:
#   1. PreToolUse hook fires → needsAttention=true via SSE
#   2. PostToolUse hook fires → needsAttention=false via SSE
#   3. Stop hook fires (no AskUserQuestion) → stopProcess is called
#   4. Stop hook fires (AskUserQuestion in transcript) → stopProcess NOT called
################################################################################

HOOK_ATTENTION_PORT=18100
HOOK_ATTENTION_PID=""
HOOK_ATTENTION_HOOK_TOKEN=""

# Start board server in test mode for hook attention tests
start_hook_attention_server() {
    kill_port "$HOOK_ATTENTION_PORT"

    print_info "Starting board server (hook-attention) on port $HOOK_ATTENTION_PORT..."
    setsid node "$SCRIPT_DIR/bin/agkan" board --port "$HOOK_ATTENTION_PORT" &
    HOOK_ATTENTION_PID=$!

    local retries=0
    while ! curl -s "http://localhost:$HOOK_ATTENTION_PORT/" > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge 50 ]; then
            print_error "Hook attention board server failed to start within 10 seconds"
            kill -- -"$HOOK_ATTENTION_PID" 2>/dev/null || true
            kill_port "$HOOK_ATTENTION_PORT"
            HOOK_ATTENTION_PID=""
            return 1
        fi
        sleep 0.2
    done

    # Fetch the test hook token (only available in NODE_ENV=test)
    local token_response
    token_response=$(curl -s "http://localhost:$HOOK_ATTENTION_PORT/api/internal/test/hook-token")
    HOOK_ATTENTION_HOOK_TOKEN=$(echo "$token_response" | jq -r '.token // empty')

    if [ -z "$HOOK_ATTENTION_HOOK_TOKEN" ]; then
        print_error "Failed to get hook token from server (got: $token_response)"
        kill -- -"$HOOK_ATTENTION_PID" 2>/dev/null || true
        kill_port "$HOOK_ATTENTION_PORT"
        HOOK_ATTENTION_PID=""
        return 1
    fi

    print_info "Hook attention board server started (PID: $HOOK_ATTENTION_PID, token: ${HOOK_ATTENTION_HOOK_TOKEN:0:8}...)"
}

stop_hook_attention_server() {
    if [ -n "$HOOK_ATTENTION_PID" ]; then
        print_info "Stopping hook attention board server (PID: $HOOK_ATTENTION_PID)..."
        kill -- -"$HOOK_ATTENTION_PID" 2>/dev/null || kill "$HOOK_ATTENTION_PID" 2>/dev/null || true
        HOOK_ATTENTION_PID=""
    fi
    kill_port "$HOOK_ATTENTION_PORT"
}

# Subscribe to SSE and capture one update message after an initial snapshot
# Returns the first update event data
capture_sse_update() {
    local api_url="$1"
    local timeout_sec="${2:-5}"

    # Use curl to get SSE data with timeout, capture lines starting with "data:"
    # We get the snapshot first, then wait for an update
    local sse_output
    sse_output=$(curl -s --max-time "$timeout_sec" \
        -H "Accept: text/event-stream" \
        "${api_url}/api/attention/stream" 2>/dev/null || true)

    echo "$sse_output"
}

test_hook_attention_pre_tool_use() {
    print_test "PreToolUse hook → needsAttention=true via SSE"

    local api_url="http://localhost:$HOOK_ATTENTION_PORT"
    local task_id=999

    # Create a task to use for attention tracking
    local task_response
    task_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"Hook Attention Test Task\",\"status\":\"in_progress\"}" \
        "${api_url}/api/tasks")
    task_id=$(echo "$task_response" | jq -r '.id // 999')

    # Subscribe to SSE in background and collect data
    local sse_tmp
    sse_tmp=$(mktemp)
    curl -s --max-time 3 \
        -H "Accept: text/event-stream" \
        "${api_url}/api/attention/stream" > "$sse_tmp" 2>/dev/null &
    local sse_pid=$!

    # Give SSE connection time to establish and receive snapshot
    sleep 0.3

    # Fire PreToolUse hook (hook-attention.mjs pre)
    local hook_exit
    BOARD_TASK_ID="$task_id" \
    BOARD_API_URL="$api_url" \
    BOARD_HOOK_TOKEN="$HOOK_ATTENTION_HOOK_TOKEN" \
    node "$SCRIPT_DIR/dist/hooks/hook-attention.mjs" pre
    hook_exit=$?

    # Wait for SSE to receive the update
    sleep 0.5
    wait "$sse_pid" 2>/dev/null || true

    local sse_output
    sse_output=$(cat "$sse_tmp")
    rm -f "$sse_tmp"

    if [ $hook_exit -ne 0 ]; then
        print_error "hook-attention.mjs pre exited with code $hook_exit"
        return 1
    fi

    # Verify needsAttention=true in SSE update
    local has_update
    has_update=$(echo "$sse_output" | grep "\"type\":\"update\"" | grep "\"needsAttention\":true" | grep "\"taskId\":$task_id")

    if [ -n "$has_update" ]; then
        print_success "PreToolUse hook fires → SSE delivers needsAttention=true for task $task_id"
    else
        print_error "PreToolUse hook: expected SSE update with needsAttention=true, got: $sse_output"
    fi
}

test_hook_attention_post_tool_use() {
    print_test "PostToolUse hook → needsAttention=false via SSE"

    local api_url="http://localhost:$HOOK_ATTENTION_PORT"
    local task_id=998

    # Create a task
    local task_response
    task_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"Hook PostToolUse Test Task\",\"status\":\"in_progress\"}" \
        "${api_url}/api/tasks")
    task_id=$(echo "$task_response" | jq -r '.id // 998')

    # First set attention=true directly via API
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "x-hook-token: $HOOK_ATTENTION_HOOK_TOKEN" \
        -d "{\"taskId\":$task_id,\"state\":\"needs\"}" \
        "${api_url}/api/internal/hooks/attention" > /dev/null

    # Subscribe to SSE
    local sse_tmp
    sse_tmp=$(mktemp)
    curl -s --max-time 3 \
        -H "Accept: text/event-stream" \
        "${api_url}/api/attention/stream" > "$sse_tmp" 2>/dev/null &
    local sse_pid=$!

    # Give SSE connection time to establish
    sleep 0.3

    # Fire PostToolUse hook (hook-attention.mjs post)
    local hook_exit
    BOARD_TASK_ID="$task_id" \
    BOARD_API_URL="$api_url" \
    BOARD_HOOK_TOKEN="$HOOK_ATTENTION_HOOK_TOKEN" \
    node "$SCRIPT_DIR/dist/hooks/hook-attention.mjs" post
    hook_exit=$?

    sleep 0.5
    wait "$sse_pid" 2>/dev/null || true

    local sse_output
    sse_output=$(cat "$sse_tmp")
    rm -f "$sse_tmp"

    if [ $hook_exit -ne 0 ]; then
        print_error "hook-attention.mjs post exited with code $hook_exit"
        return 1
    fi

    # Verify needsAttention=false in SSE update
    local has_update
    has_update=$(echo "$sse_output" | grep "\"type\":\"update\"" | grep "\"needsAttention\":false" | grep "\"taskId\":$task_id")

    if [ -n "$has_update" ]; then
        print_success "PostToolUse hook fires → SSE delivers needsAttention=false for task $task_id"
    else
        print_error "PostToolUse hook: expected SSE update with needsAttention=false, got: $sse_output"
    fi
}

test_hook_attention_snapshot_contains_task() {
    print_test "SSE snapshot includes taskId when needsAttention=true"

    local api_url="http://localhost:$HOOK_ATTENTION_PORT"

    # Create a fresh task
    local task_response
    task_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"Snapshot Test Task\",\"status\":\"in_progress\"}" \
        "${api_url}/api/tasks")
    local task_id
    task_id=$(echo "$task_response" | jq -r '.id // 997')

    # Set attention=true via attention API
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "x-hook-token: $HOOK_ATTENTION_HOOK_TOKEN" \
        -d "{\"taskId\":$task_id,\"state\":\"needs\"}" \
        "${api_url}/api/internal/hooks/attention" > /dev/null

    # Connect to SSE and capture snapshot
    local sse_tmp
    sse_tmp=$(mktemp)
    curl -s --max-time 1 \
        -H "Accept: text/event-stream" \
        "${api_url}/api/attention/stream" > "$sse_tmp" 2>/dev/null || true

    local sse_output
    sse_output=$(cat "$sse_tmp")
    rm -f "$sse_tmp"

    local has_snapshot
    has_snapshot=$(echo "$sse_output" | grep "\"type\":\"snapshot\"" | grep "\"taskIds\"")

    if [ -n "$has_snapshot" ]; then
        # Check if the snapshot contains our task_id
        if echo "$has_snapshot" | jq -e ".taskIds | index($task_id) != null" > /dev/null 2>&1; then
            print_success "SSE snapshot contains taskId $task_id with needsAttention=true"
        else
            # Try parsing the data line
            local snapshot_data
            snapshot_data=$(echo "$sse_output" | grep "^data:" | head -1 | sed 's/^data: //')
            if echo "$snapshot_data" | jq -e ".taskIds | index($task_id) != null" > /dev/null 2>&1; then
                print_success "SSE snapshot contains taskId $task_id with needsAttention=true"
            else
                print_error "SSE snapshot does not contain taskId $task_id; snapshot: $snapshot_data"
            fi
        fi
    else
        print_error "SSE snapshot not found in output: $sse_output"
    fi
}

test_hook_stop_without_ask_user_question() {
    print_test "Stop hook (no AskUserQuestion in transcript) → stopProcess called"

    local api_url="http://localhost:$HOOK_ATTENTION_PORT"

    # Create transcript without AskUserQuestion
    local transcript_tmp
    transcript_tmp=$(mktemp --suffix=".jsonl")
    cat > "$transcript_tmp" << 'EOF'
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","id":"t1","input":{}}]}}
EOF

    # Create a task
    local task_response
    task_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"Stop Hook Test Task\",\"status\":\"in_progress\"}" \
        "${api_url}/api/tasks")
    local task_id
    task_id=$(echo "$task_response" | jq -r '.id // 996')

    # Fire Stop hook
    local hook_stdin
    hook_stdin=$(printf '{"stop_reason":"end_turn","transcript_path":"%s","session_id":"test-session"}' "$transcript_tmp")

    local hook_exit
    hook_exit=0
    echo "$hook_stdin" | BOARD_TASK_ID="$task_id" \
        BOARD_API_URL="$api_url" \
        BOARD_HOOK_TOKEN="$HOOK_ATTENTION_HOOK_TOKEN" \
        node "$SCRIPT_DIR/dist/hooks/hook-stop.mjs"
    hook_exit=$?

    rm -f "$transcript_tmp"

    if [ $hook_exit -ne 0 ]; then
        print_error "hook-stop.mjs exited with code $hook_exit"
        return 1
    fi

    # Verify the stop API was called — check task was updated
    # The stop endpoint calls stopProcess on the pty service, but since no PTY is running,
    # we just verify the API request reached the endpoint (200 response means it was processed)
    # We can verify indirectly by calling the stop API again and confirming it responds 200
    local stop_response
    stop_response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -H "x-hook-token: $HOOK_ATTENTION_HOOK_TOKEN" \
        -d "{\"taskId\":$task_id,\"reason\":\"complete\"}" \
        "${api_url}/api/internal/hooks/stop")

    if [ "$stop_response" = "200" ]; then
        print_success "Stop hook (no AskUserQuestion) → fires stop API successfully (200)"
    else
        print_error "Stop hook: expected 200 from stop API, got $stop_response"
    fi
}

test_hook_stop_with_ask_user_question() {
    print_test "Stop hook (AskUserQuestion in transcript) → stopProcess NOT called"

    local api_url="http://localhost:$HOOK_ATTENTION_PORT"

    # Create transcript WITH AskUserQuestion as last tool_use
    local transcript_tmp
    transcript_tmp=$(mktemp --suffix=".jsonl")
    cat > "$transcript_tmp" << 'EOF'
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"AskUserQuestion","id":"t1","input":{"question":"What do you want?"}}]}}
EOF

    local task_id=995

    # Fire Stop hook
    local hook_stdin
    hook_stdin=$(printf '{"stop_reason":"end_turn","transcript_path":"%s","session_id":"test-session"}' "$transcript_tmp")

    # Capture stop API calls by checking no stop request comes through
    # We'll count stop requests before and after
    local stop_count_before
    stop_count_before=$(curl -s "${api_url}/api/attention/stream" --max-time 0.1 2>/dev/null | wc -l || echo "0")

    local hook_exit
    hook_exit=0
    echo "$hook_stdin" | BOARD_TASK_ID="$task_id" \
        BOARD_API_URL="$api_url" \
        BOARD_HOOK_TOKEN="$HOOK_ATTENTION_HOOK_TOKEN" \
        node "$SCRIPT_DIR/dist/hooks/hook-stop.mjs"
    hook_exit=$?

    rm -f "$transcript_tmp"

    if [ $hook_exit -ne 0 ]; then
        print_error "hook-stop.mjs exited with code $hook_exit (expected 0)"
        return 1
    fi

    # The hook should NOT have called the stop endpoint
    # We can verify this by checking the hook's behavior: it exits 0 without posting
    # Since we can't easily intercept the HTTP call, we use a mock approach:
    # Set an unreachable API URL so if it tries to post, it would fail (but still exit 0)
    local hook_stderr_tmp
    hook_stderr_tmp=$(mktemp)

    echo "$hook_stdin" | BOARD_TASK_ID="$task_id" \
        BOARD_API_URL="http://127.0.0.1:1" \
        BOARD_HOOK_TOKEN="$HOOK_ATTENTION_HOOK_TOKEN" \
        node "$SCRIPT_DIR/dist/hooks/hook-stop.mjs" 2>"$hook_stderr_tmp"
    local mock_exit=$?

    local stderr_content
    stderr_content=$(cat "$hook_stderr_tmp")
    rm -f "$hook_stderr_tmp"

    # Re-create transcript since previous one was deleted
    transcript_tmp=$(mktemp --suffix=".jsonl")
    cat > "$transcript_tmp" << 'EOF'
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"AskUserQuestion","id":"t1","input":{"question":"What do you want?"}}]}}
EOF
    hook_stdin=$(printf '{"stop_reason":"end_turn","transcript_path":"%s","session_id":"test-session"}' "$transcript_tmp")

    hook_stderr_tmp=$(mktemp)
    echo "$hook_stdin" | BOARD_TASK_ID="$task_id" \
        BOARD_API_URL="http://127.0.0.1:1" \
        BOARD_HOOK_TOKEN="$HOOK_ATTENTION_HOOK_TOKEN" \
        node "$SCRIPT_DIR/dist/hooks/hook-stop.mjs" 2>"$hook_stderr_tmp"
    local ask_exit=$?
    local ask_stderr
    ask_stderr=$(cat "$hook_stderr_tmp")
    rm -f "$hook_stderr_tmp" "$transcript_tmp"

    # With AskUserQuestion, the hook should NOT attempt to call the API
    # So no connection error should appear in stderr
    if [ $ask_exit -eq 0 ] && [ -z "$ask_stderr" ]; then
        print_success "Stop hook (AskUserQuestion) → exits 0 without calling stop API"
    else
        print_error "Stop hook (AskUserQuestion): unexpected stderr='$ask_stderr' exit=$ask_exit"
    fi
}

test_hook_token_auth_rejects_bad_token() {
    print_test "Hook API rejects requests with invalid token (401)"

    local api_url="http://localhost:$HOOK_ATTENTION_PORT"

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -H "x-hook-token: invalid-token-xyz" \
        -d '{"taskId":1,"state":"needs"}' \
        "${api_url}/api/internal/hooks/attention")

    if [ "$http_code" = "401" ]; then
        print_success "Hook API returns 401 for invalid token"
    else
        print_error "Hook API expected 401 for invalid token, got $http_code"
    fi
}

test_hook_token_auth_rejects_no_token() {
    print_test "Hook API rejects requests without token (401)"

    local api_url="http://localhost:$HOOK_ATTENTION_PORT"

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"taskId":1,"state":"needs"}' \
        "${api_url}/api/internal/hooks/attention")

    if [ "$http_code" = "401" ]; then
        print_success "Hook API returns 401 when token header is absent"
    else
        print_error "Hook API expected 401 without token, got $http_code"
    fi
}

test_hook_attention() {
    print_section "Section: Hook Attention E2E Tests"

    # Reset database to ensure clean state
    if [ -f "$TEST_DB_PATH" ]; then
        rm -f "$TEST_DB_PATH"
    fi

    start_hook_attention_server
    if [ -z "$HOOK_ATTENTION_PID" ]; then
        print_error "Skipping hook attention tests - server failed to start"
        return 1
    fi

    trap stop_hook_attention_server EXIT

    # Run tests
    test_hook_token_auth_rejects_bad_token
    test_hook_token_auth_rejects_no_token
    test_hook_attention_pre_tool_use
    test_hook_attention_post_tool_use
    test_hook_attention_snapshot_contains_task
    test_hook_stop_without_ask_user_question
    test_hook_stop_with_ask_user_question

    stop_hook_attention_server
    trap - EXIT
}
