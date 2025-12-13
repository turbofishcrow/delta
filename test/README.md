# Test Suite

This directory contains all test files for the Delta-Rational Chord Explorer.

## Test Files

### FDR (Fully Delta-Rational) Tests
- **[test_fdr.html](test_fdr.html)** - Browser-based FDR error calculation tests

### PDR (Partially Delta-Rational) Tests
- **[test_pdr.html](test_pdr.html)** - Browser-based PDR optimizer comparison tests (L-BFGS-B, Nelder-Mead, Powell)
- **[test_new_pdr_cases.js](test_new_pdr_cases.js)** - Command-line test of 4 PDR test cases with 3 optimizers
- **[test_pdr_modes.js](test_pdr_modes.js)** - Tests all 6 error modes (3 models × 2 domains) for PDR
- **[test_pdr_edo.js](test_pdr_edo.js)** - Tests PDR on EDO-based chords
- **[test_pdr_debug.js](test_pdr_debug.js)** - Debug script to verify pairwise vs all-steps models

### Test Case Generators
- **[generate_pdr_test_cases.js](generate_pdr_test_cases.js)** - Generates PDR test cases for systematic testing

### Documentation
- **[PDR_TEST_README.md](PDR_TEST_README.md)** - Detailed documentation of PDR test cases and methodology

## Running Tests

### Browser Tests
Open the HTML files directly in your browser:
```bash
# FDR tests
open test/test_fdr.html

# PDR tests
open test/test_pdr.html
```

### Command-Line Tests
Run the Node.js test scripts from the parent directory:
```bash
# All PDR test cases
node test/test_new_pdr_cases.js

# Test all 6 error modes
node test/test_pdr_modes.js

# Test EDO-based chords
node test/test_pdr_edo.js

# Debug pairwise vs all-steps
node test/test_pdr_debug.js

# Generate new test cases
node test/generate_pdr_test_cases.js
```

## Test Coverage

The test suite covers:
- ✓ FDR error calculation with grid search
- ✓ PDR optimization with L-BFGS-B, Nelder-Mead, and Powell methods
- ✓ All 6 error modes: rooted/pairwise/all-steps × linear/log
- ✓ Optimizer agreement across different methods
- ✓ EDO-based chord approximations
- ✓ Edge cases (all free deltas, single free delta, etc.)
