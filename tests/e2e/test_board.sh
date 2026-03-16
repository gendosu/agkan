#!/bin/bash

################################################################################
# Section: Board Server E2E Tests
#
# Tests the board HTTP server by starting it in the background,
# running curl requests against the API, and verifying responses.
################################################################################

BOARD_PORT=18080
BOARD_PID=""

# Kill any process using the given port
kill_port() {
    local port="$1"
    local pids
    pids=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 0.5
    fi
}

# Start board server in background and wait for it to be ready
start_board_server() {
    # Kill any existing server on this port first
    kill_port "$BOARD_PORT"

    print_info "Starting board server on port $BOARD_PORT..."
    npx . board --port "$BOARD_PORT" &
    BOARD_PID=$!

    # Wait for the server to be ready (max 10 seconds)
    local retries=0
    while ! curl -s "http://localhost:$BOARD_PORT/" > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge 50 ]; then
            print_error "Board server failed to start within 10 seconds"
            kill_port "$BOARD_PORT"
            BOARD_PID=""
            return 1
        fi
        sleep 0.2
    done

    print_info "Board server started (PID: $BOARD_PID)"
}

# Stop board server
stop_board_server() {
    if [ -n "$BOARD_PID" ]; then
        print_info "Stopping board server (PID: $BOARD_PID)..."
        kill "$BOARD_PID" 2>/dev/null
        wait "$BOARD_PID" 2>/dev/null
        BOARD_PID=""
    fi
    # Also kill any remaining process on the port
    kill_port "$BOARD_PORT"
}

test_board_get_html() {
    print_test "GET / returns HTML board page"
    local response
    local http_code
    response=$(curl -s -w "\n%{http_code}" "http://localhost:$BOARD_PORT/")
    http_code=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ] && echo "$body" | grep -q "agkan board"; then
        print_success "GET / returns 200 with board HTML"
    else
        print_error "GET / expected 200 with board HTML, got $http_code"
    fi
}

test_board_html_columns() {
    print_test "GET / contains all status columns"
    local body
    body=$(curl -s "http://localhost:$BOARD_PORT/")

    local all_found=true
    for status in icebox backlog ready in_progress review done closed; do
        if ! echo "$body" | grep -q "data-status=\"$status\""; then
            print_error "GET / missing column: $status"
            all_found=false
        fi
    done

    if [ "$all_found" = true ]; then
        print_success "GET / contains all 7 status columns"
    fi
}

test_board_api_get_tasks_empty() {
    print_test "GET /api/tasks returns empty task list"
    local response
    response=$(curl -s "http://localhost:$BOARD_PORT/api/tasks")

    if echo "$response" | jq -e '.tasks | length == 0' > /dev/null 2>&1; then
        print_success "GET /api/tasks returns empty tasks array"
    else
        print_error "GET /api/tasks expected empty tasks array"
    fi
}

test_board_api_post_task() {
    print_test "POST /api/tasks creates a new task"
    local response
    local http_code
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"title":"E2E Board Task","status":"ready"}' \
        "http://localhost:$BOARD_PORT/api/tasks")
    http_code=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "201" ] && echo "$body" | jq -e '.title == "E2E Board Task" and .status == "ready"' > /dev/null 2>&1; then
        BOARD_TASK_ID=$(echo "$body" | jq -r '.id')
        print_success "POST /api/tasks returns 201 with created task (ID: $BOARD_TASK_ID)"
    else
        print_error "POST /api/tasks expected 201 with task, got $http_code"
    fi
}

test_board_api_post_task_with_priority() {
    print_test "POST /api/tasks with priority sets metadata"
    local response
    local http_code
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"title":"Priority Task","status":"backlog","priority":"high"}' \
        "http://localhost:$BOARD_PORT/api/tasks")
    http_code=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "201" ]; then
        local task_id
        task_id=$(echo "$body" | jq -r '.id')
        # Verify priority via detail endpoint
        local detail
        detail=$(curl -s "http://localhost:$BOARD_PORT/api/tasks/$task_id")
        if echo "$detail" | jq -e '.task.priority == "high"' > /dev/null 2>&1; then
            print_success "POST /api/tasks with priority stores priority metadata"
        else
            print_error "POST /api/tasks priority metadata not found in detail"
        fi
    else
        print_error "POST /api/tasks with priority expected 201, got $http_code"
    fi
}

test_board_api_post_task_empty_title() {
    print_test "POST /api/tasks with empty title returns 400"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"title":""}' \
        "http://localhost:$BOARD_PORT/api/tasks")

    if [ "$http_code" = "400" ]; then
        print_success "POST /api/tasks with empty title returns 400"
    else
        print_error "POST /api/tasks with empty title expected 400, got $http_code"
    fi
}

test_board_api_get_task_detail() {
    print_test "GET /api/tasks/:id returns task detail"
    local response
    response=$(curl -s "http://localhost:$BOARD_PORT/api/tasks/$BOARD_TASK_ID")

    if echo "$response" | jq -e '.task.id and .tags and .metadata' > /dev/null 2>&1; then
        local title
        title=$(echo "$response" | jq -r '.task.title')
        if [ "$title" = "E2E Board Task" ]; then
            print_success "GET /api/tasks/$BOARD_TASK_ID returns task with tags and metadata"
        else
            print_error "GET /api/tasks/$BOARD_TASK_ID wrong title: $title"
        fi
    else
        print_error "GET /api/tasks/$BOARD_TASK_ID expected task/tags/metadata structure"
    fi
}

test_board_api_get_task_not_found() {
    print_test "GET /api/tasks/99999 returns 404"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://localhost:$BOARD_PORT/api/tasks/99999")

    if [ "$http_code" = "404" ]; then
        print_success "GET /api/tasks/99999 returns 404"
    else
        print_error "GET /api/tasks/99999 expected 404, got $http_code"
    fi
}

test_board_api_get_task_invalid_id() {
    print_test "GET /api/tasks/abc returns 400"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://localhost:$BOARD_PORT/api/tasks/abc")

    if [ "$http_code" = "400" ]; then
        print_success "GET /api/tasks/abc returns 400"
    else
        print_error "GET /api/tasks/abc expected 400, got $http_code"
    fi
}

test_board_api_patch_task() {
    print_test "PATCH /api/tasks/:id updates status"
    local response
    local http_code
    response=$(curl -s -w "\n%{http_code}" -X PATCH \
        -H "Content-Type: application/json" \
        -d '{"status":"in_progress"}' \
        "http://localhost:$BOARD_PORT/api/tasks/$BOARD_TASK_ID")
    http_code=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ] && echo "$body" | jq -e '.status == "in_progress"' > /dev/null 2>&1; then
        print_success "PATCH /api/tasks/$BOARD_TASK_ID updates status to in_progress"
    else
        print_error "PATCH /api/tasks/$BOARD_TASK_ID expected 200 with updated status, got $http_code"
    fi
}

test_board_api_patch_task_invalid_status() {
    print_test "PATCH /api/tasks/:id with invalid status returns 400"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
        -H "Content-Type: application/json" \
        -d '{"status":"invalid_status"}' \
        "http://localhost:$BOARD_PORT/api/tasks/$BOARD_TASK_ID")

    if [ "$http_code" = "400" ]; then
        print_success "PATCH with invalid status returns 400"
    else
        print_error "PATCH with invalid status expected 400, got $http_code"
    fi
}

test_board_api_patch_task_not_found() {
    print_test "PATCH /api/tasks/99999 returns 404"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
        -H "Content-Type: application/json" \
        -d '{"status":"done"}' \
        "http://localhost:$BOARD_PORT/api/tasks/99999")

    if [ "$http_code" = "404" ]; then
        print_success "PATCH /api/tasks/99999 returns 404"
    else
        print_error "PATCH /api/tasks/99999 expected 404, got $http_code"
    fi
}

test_board_api_delete_task() {
    print_test "DELETE /api/tasks/:id deletes a task"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
        "http://localhost:$BOARD_PORT/api/tasks/$BOARD_TASK_ID")

    if [ "$http_code" = "200" ]; then
        # Verify it's gone
        local verify_code
        verify_code=$(curl -s -o /dev/null -w "%{http_code}" \
            "http://localhost:$BOARD_PORT/api/tasks/$BOARD_TASK_ID")
        if [ "$verify_code" = "404" ]; then
            print_success "DELETE /api/tasks/$BOARD_TASK_ID succeeds and task is gone"
        else
            print_error "DELETE succeeded but task still exists"
        fi
    else
        print_error "DELETE /api/tasks/$BOARD_TASK_ID expected 200, got $http_code"
    fi
}

test_board_api_delete_task_not_found() {
    print_test "DELETE /api/tasks/99999 returns 404"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
        "http://localhost:$BOARD_PORT/api/tasks/99999")

    if [ "$http_code" = "404" ]; then
        print_success "DELETE /api/tasks/99999 returns 404"
    else
        print_error "DELETE /api/tasks/99999 expected 404, got $http_code"
    fi
}

test_board_html_shows_task() {
    print_test "GET / shows created tasks in HTML"
    # Create a task first
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"title":"HTML Visible Task","status":"review"}' \
        "http://localhost:$BOARD_PORT/api/tasks" > /dev/null

    local body
    body=$(curl -s "http://localhost:$BOARD_PORT/")

    if echo "$body" | grep -q "HTML Visible Task"; then
        print_success "GET / renders created task in HTML"
    else
        print_error "GET / does not contain created task"
    fi
}

test_board_title_option() {
    print_test "--title option displays board title in header"
    local title_port=$((BOARD_PORT + 1))
    local title_pid=""

    # Kill any existing server on this port first
    kill_port "$title_port"

    npx . board --port "$title_port" --title "My Project" &
    title_pid=$!

    # Wait for server to be ready (max 10 seconds)
    local retries=0
    while ! curl -s "http://localhost:$title_port/" > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge 50 ]; then
            print_error "--title option: server failed to start"
            kill_port "$title_port"
            return 1
        fi
        sleep 0.2
    done

    local body
    body=$(curl -s "http://localhost:$title_port/")

    kill "$title_pid" 2>/dev/null
    wait "$title_pid" 2>/dev/null
    kill_port "$title_port"

    if echo "$body" | grep -q 'class="board-title"' && echo "$body" | grep -q "My Project"; then
        print_success "--title option shows board title in header"
    else
        print_error "--title option did not show board title in header"
    fi
}

test_board_no_title_option() {
    print_test "No --title option does not show board-title element"
    local body
    body=$(curl -s "http://localhost:$BOARD_PORT/")

    if echo "$body" | grep -q 'class="board-title"'; then
        print_error "board-title element should not be present when --title is not provided"
    else
        print_success "No --title option: board-title element is absent"
    fi
}

test_board() {
    print_section "Section: Board Server E2E Tests"

    BOARD_TASK_ID=""

    # Reset database to ensure board tests start with empty state
    if [ -f "$TEST_DB_PATH" ]; then
        rm -f "$TEST_DB_PATH"
    fi

    start_board_server
    if [ -z "$BOARD_PID" ]; then
        print_error "Skipping board tests - server failed to start"
        return 1
    fi

    # Ensure server is stopped on exit
    trap stop_board_server EXIT

    # Run tests
    test_board_get_html
    test_board_html_columns
    test_board_api_get_tasks_empty
    test_board_api_post_task
    test_board_api_post_task_with_priority
    test_board_api_post_task_empty_title
    test_board_api_get_task_detail
    test_board_api_get_task_not_found
    test_board_api_get_task_invalid_id
    test_board_api_patch_task
    test_board_api_patch_task_invalid_status
    test_board_api_patch_task_not_found
    test_board_api_delete_task
    test_board_api_delete_task_not_found
    test_board_html_shows_task
    test_board_no_title_option
    test_board_title_option

    stop_board_server
    trap - EXIT
}
