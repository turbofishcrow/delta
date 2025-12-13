#!/usr/bin/env python3
"""
Analytically compute optimal x values for FDR error calculation using SymPy.
"""

import sympy as sp
from sympy import symbols, sqrt, log, diff, solve, simplify, N
import math

def cents_to_ratio(cents):
    """Convert cents to frequency ratio."""
    return 2 ** (cents / 1200)

def solve_fdr_error(ratios, deltas, domain, model, verbose=False):
    """
    Solve for optimal x analytically using SymPy.

    Args:
        ratios: List of frequency ratios from root [f1, f2, ...]
        deltas: List of target deltas [d1, d2, ...]
        domain: "linear" or "log"
        model: "rooted", "pairwise", or "all-steps"
        verbose: Print intermediate steps

    Returns:
        (optimal_x, error_at_optimal_x)
    """
    x = symbols('x', positive=True, real=True)
    n = len(ratios)

    # Calculate cumulative deltas
    cumulative_deltas = []
    cum_sum = 0
    for d in deltas:
        cum_sum += d
        cumulative_deltas.append(cum_sum)

    # Build target ratios: [1, 1+D1/x, 1+D2/x, ...]
    target_ratios = [1] + [1 + D/x for D in cumulative_deltas]

    # Build error function (sum of squared errors)
    sum_squared_error = 0

    if model == "rooted":
        # Rooted: compare each interval from root
        for i in range(n):
            target = target_ratios[i + 1]
            actual = ratios[i]

            if domain == "linear":
                diff_expr = target - actual
            else:  # log
                diff_expr = log(target) - log(actual)

            sum_squared_error += diff_expr**2
    elif model == "pairwise":
        # Pairwise: compare all interval pairs
        all_ratios = [1] + list(ratios)
        all_target_ratios = target_ratios

        for i in range(len(all_target_ratios)):
            for j in range(i + 1, len(all_target_ratios)):
                target_interval = all_target_ratios[j] / all_target_ratios[i]
                actual_interval = all_ratios[j] / all_ratios[i]

                if domain == "linear":
                    diff_expr = target_interval - actual_interval
                else:  # log
                    diff_expr = log(target_interval) - log(actual_interval)

                sum_squared_error += diff_expr**2
    elif model == "all-steps":
        # All-steps: compare only successive intervals (disjoint)
        all_ratios = [1] + list(ratios)
        all_target_ratios = target_ratios

        for i in range(n):
            target_interval = all_target_ratios[i + 1] / all_target_ratios[i]
            actual_interval = all_ratios[i + 1] / all_ratios[i]

            if domain == "linear":
                diff_expr = target_interval - actual_interval
            else:  # log
                diff_expr = log(target_interval) - log(actual_interval)

            sum_squared_error += diff_expr**2

    if verbose:
        print(f"\nError function (sum of squared errors):")
        print(f"E(x) = {sum_squared_error}")

    # Take derivative with respect to x
    derivative = diff(sum_squared_error, x)

    if verbose:
        print(f"\nDerivative dE/dx:")
        print(f"{derivative}")

    # Solve for critical points
    critical_points = solve(derivative, x)

    if verbose:
        print(f"\nCritical points: {critical_points}")

    # Filter for positive real solutions
    valid_solutions = []
    for sol in critical_points:
        try:
            val = complex(N(sol))
            if val.imag == 0 and val.real > 0:
                valid_solutions.append(val.real)
        except:
            continue

    if not valid_solutions:
        print(f"Warning: No valid positive real solutions found for {domain}/{model}")
        return None, None

    # Evaluate error at each valid solution and pick the one with minimum error
    best_x = None
    best_error = float('inf')

    for x_val in valid_solutions:
        error_val = float(N(sqrt(sum_squared_error.subs(x, x_val))))

        # Convert to cents if logarithmic
        if domain == "log":
            error_val = error_val * (1200 / math.log(2))

        if error_val < best_error:
            best_error = error_val
            best_x = x_val

    return float(best_x), float(best_error)


def main():
    """Run analytical solutions for all test cases."""

    test_cases = [
        {
            "name": "4:5:6 with +1+1",
            "ratios": [1.25, 1.5],
            "deltas": [1, 1]
        },
        {
            "name": "0c-400c-720c with +1+1",
            "ratios": [cents_to_ratio(400), cents_to_ratio(720)],
            "deltas": [1, 1]
        },
        {
            "name": "0c-276.9c-738.5c-923.1c with +1+2+1",
            "ratios": [cents_to_ratio(276.9), cents_to_ratio(738.5), cents_to_ratio(923.1)],
            "deltas": [1, 2, 1]
        },
        {
            "name": "0c-257.1c-771.4c-942.9c with +1+3+1",
            "ratios": [cents_to_ratio(257.1), cents_to_ratio(771.4), cents_to_ratio(942.9)],
            "deltas": [1, 3, 1]
        }
    ]

    # Only solve linear cases analytically (log domain is too complex for SymPy)
    modes = [
        {"domain": "linear", "model": "rooted", "key": "linear-rooted"},
        {"domain": "linear", "model": "pairwise", "key": "linear-pairwise"},
        {"domain": "linear", "model": "all-steps", "key": "linear-all-steps"}
    ]

    print("=" * 80)
    print("ANALYTICAL SOLUTIONS FOR FDR ERROR CALCULATION (LINEAR DOMAIN ONLY)")
    print("=" * 80)
    print("Note: Logarithmic domain solutions are too complex for symbolic math.")
    print("Use numerical grid search results for log-rooted and log-pairwise.")

    for test_case in test_cases:
        print(f"\n{'=' * 80}")
        print(f"Test case: {test_case['name']}")
        print(f"{'=' * 80}")
        print(f"Ratios: {[f'{r:.8f}' for r in test_case['ratios']]}")
        print(f"Deltas: {test_case['deltas']}")
        print()

        results = {}

        for mode in modes:
            print(f"Solving {mode['key']}...", end=" ", flush=True)

            x_opt, error_opt = solve_fdr_error(
                test_case['ratios'],
                test_case['deltas'],
                mode['domain'],
                mode['model'],
                verbose=False
            )

            if x_opt is not None:
                results[mode['key']] = {'x': x_opt, 'error': error_opt}
                print(f"x = {x_opt:.8f}, error = {error_opt:.8f}")
            else:
                print("FAILED")

        print("\n--- JavaScript test data format ---")
        print(f"expectedX: {{")
        for mode in modes:
            if mode['key'] in results:
                print(f'  "{mode["key"]}": {results[mode["key"]]["x"]:.4f},')
        print(f"}},")
        print(f"expectedError: {{")
        for mode in modes:
            if mode['key'] in results:
                err = results[mode['key']]['error']
                if mode['domain'] == 'log':
                    print(f'  "{mode["key"]}": {err:.3f},')
                else:
                    print(f'  "{mode["key"]}": {err:.6f},')
        print(f"}}")

if __name__ == "__main__":
    main()
