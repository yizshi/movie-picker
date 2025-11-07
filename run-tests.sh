#!/bin/bash

echo "🧪 Running Movie Picker Test Suite"
echo "=================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run tests and check result
run_test() {
    local test_name=$1
    local test_command=$2
    local test_dir=$3
    
    echo -e "\n${YELLOW}Running $test_name...${NC}"
    
    if [ -n "$test_dir" ]; then
        cd "$test_dir"
    fi
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ $test_name passed${NC}"
        if [ -n "$test_dir" ]; then
            cd ..
        fi
        return 0
    else
        echo -e "${RED}❌ $test_name failed${NC}"
        if [ -n "$test_dir" ]; then
            cd ..
        fi
        return 1
    fi
}

# Install dependencies if needed
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install --silent
cd functions && npm install --silent && cd ..

# Track test results
failed_tests=0

# Run main tests
run_test "Main Application Tests" "npm test" ""
if [ $? -ne 0 ]; then
    ((failed_tests++))
fi

# Run Functions tests
run_test "Firebase Functions Tests" "npm test" "functions"
if [ $? -ne 0 ]; then
    ((failed_tests++))
fi

# Generate coverage if all tests pass
if [ $failed_tests -eq 0 ]; then
    echo -e "\n${YELLOW}📊 Generating coverage report...${NC}"
    npm run test:coverage --silent
    echo -e "${GREEN}✅ Test coverage report generated in ./coverage/${NC}"
fi

# Summary
echo -e "\n=================================="
if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}💥 $failed_tests test suite(s) failed${NC}"
    exit 1
fi
