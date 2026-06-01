// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

/**
 * Maximum equity run-up as a percent of initial capital.
 * Matches Pine's strategy.max_runup_percent.
 */
export function max_runup_percent(context: any) {
    return () => {
        const s = context.strategy;
        if (!s || !s.initial_capital) return 0;
        return (100 * s.max_runup) / s.initial_capital;
    };
}
