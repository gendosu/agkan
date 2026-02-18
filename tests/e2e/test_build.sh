#!/bin/bash

################################################################################
# Section 1: Build
################################################################################

test_build() {
    print_section "Section 1: Build"

    print_test "Running build..."
    if npm run build > /dev/null 2>&1; then
        print_success "Build completed successfully"
        return 0
    else
        print_error "Build failed"
        return 1
    fi
}
