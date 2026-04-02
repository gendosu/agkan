#!/bin/bash

################################################################################
# Section: Board Daemon E2E Tests
#
# Tests the board daemon start/stop/restart subcommands.
################################################################################

DAEMON_PORT=18090
DAEMON_PID_FILE=""

# Resolve PID file path (mirrors board-daemon.ts logic for test mode)
get_daemon_pid_file() {
    echo "$SCRIPT_DIR/.agkan-test/board.pid"
}

# Stop any daemon started by these tests
cleanup_board_daemon() {
    local pid_file
    pid_file=$(get_daemon_pid_file)
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ]; then
            kill "$pid" 2>/dev/null || true
        fi
        rm -f "$pid_file"
    fi
    # Also kill any lingering process on the daemon port
    local pids
    pids=$(lsof -ti tcp:$DAEMON_PORT 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 0.3
    fi
}

test_board_daemon_start() {
    print_test "board start launches background daemon"

    cleanup_board_daemon

    node "$SCRIPT_DIR/bin/agkan" board start --port "$DAEMON_PORT"
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        print_error "board start exited with code $exit_code"
        return 1
    fi

    local pid_file
    pid_file=$(get_daemon_pid_file)
    if [ ! -f "$pid_file" ]; then
        print_error "board start did not create PID file at $pid_file"
        cleanup_board_daemon
        return 1
    fi

    # Wait for the server to be ready (max 10 seconds)
    local retries=0
    while ! curl -s "http://localhost:$DAEMON_PORT/" > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge 50 ]; then
            print_error "board start: server did not become ready within 10 seconds"
            cleanup_board_daemon
            return 1
        fi
        sleep 0.2
    done

    print_success "board start launched daemon and server is reachable"
}

test_board_daemon_start_already_running() {
    print_test "board start shows already running message when daemon is active"

    local output
    output=$(node "$SCRIPT_DIR/bin/agkan" board start --port "$DAEMON_PORT" 2>&1)

    if echo "$output" | grep -q "already running"; then
        print_success "board start reports already running correctly"
    else
        print_error "board start expected 'already running' message, got: $output"
    fi
}

test_board_daemon_stop() {
    print_test "board stop terminates the daemon"

    node "$SCRIPT_DIR/bin/agkan" board stop
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        print_error "board stop exited with code $exit_code"
        return 1
    fi

    # Give the process time to terminate
    sleep 0.5

    local pid_file
    pid_file=$(get_daemon_pid_file)
    if [ -f "$pid_file" ]; then
        print_error "board stop did not remove PID file"
        cleanup_board_daemon
        return 1
    fi

    if curl -s "http://localhost:$DAEMON_PORT/" > /dev/null 2>&1; then
        print_error "board stop: server is still reachable after stop"
        cleanup_board_daemon
        return 1
    fi

    print_success "board stop terminated daemon and removed PID file"
}

test_board_daemon_stop_not_running() {
    print_test "board stop shows not running message when no daemon is active"

    local output
    output=$(node "$SCRIPT_DIR/bin/agkan" board stop 2>&1)

    if echo "$output" | grep -q "not running"; then
        print_success "board stop reports not running correctly"
    else
        print_error "board stop expected 'not running' message, got: $output"
    fi
}

test_board_daemon_restart() {
    print_test "board restart starts a new daemon"

    # Start first
    node "$SCRIPT_DIR/bin/agkan" board start --port "$DAEMON_PORT"

    local retries=0
    while ! curl -s "http://localhost:$DAEMON_PORT/" > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge 50 ]; then
            print_error "board restart: initial start did not become ready"
            cleanup_board_daemon
            return 1
        fi
        sleep 0.2
    done

    local old_pid
    old_pid=$(cat "$(get_daemon_pid_file)" 2>/dev/null)

    # Restart
    node "$SCRIPT_DIR/bin/agkan" board restart --port "$DAEMON_PORT"
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        print_error "board restart exited with code $exit_code"
        cleanup_board_daemon
        return 1
    fi

    # Wait for new server
    retries=0
    while ! curl -s "http://localhost:$DAEMON_PORT/" > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge 50 ]; then
            print_error "board restart: server did not become ready after restart"
            cleanup_board_daemon
            return 1
        fi
        sleep 0.2
    done

    local new_pid
    new_pid=$(cat "$(get_daemon_pid_file)" 2>/dev/null)

    if [ "$old_pid" = "$new_pid" ]; then
        print_error "board restart: PID did not change (old=$old_pid, new=$new_pid)"
        cleanup_board_daemon
        return 1
    fi

    print_success "board restart replaced daemon (old PID: $old_pid, new PID: $new_pid)"

    cleanup_board_daemon
}

test_board_daemon() {
    print_section "Section: Board Daemon E2E Tests"

    # Ensure clean state
    cleanup_board_daemon

    test_board_daemon_start
    test_board_daemon_start_already_running
    test_board_daemon_stop
    test_board_daemon_stop_not_running
    test_board_daemon_restart

    # Final cleanup
    cleanup_board_daemon
}
