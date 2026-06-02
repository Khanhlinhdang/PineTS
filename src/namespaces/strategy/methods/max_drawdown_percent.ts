// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

/**
 * Maximum drawdown as a percent of the equity high-water mark.
 * Matches Pine's strategy.max_drawdown_percent.
 */
export function max_drawdown_percent(context: any) {
    return () => {
        const s = context.strategy;
        if (!s || !s.equity_peak) return 0;
        return (100 * s.max_drawdown) / s.equity_peak;
    };
}
