// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

/**
 * Unrealized P&L expressed as a percent of initial capital.
 * Matches Pine's strategy.openprofit_percent.
 */
export function openprofit_percent(context: any) {
    return () => {
        const s = context.strategy;
        if (!s || !s.initial_capital) return 0;
        return (100 * s.openprofit) / s.initial_capital;
    };
}
