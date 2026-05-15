// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

/**
 * Count of closed trades. Matches Pine's strategy.closedtrades.
 *
 * The result-state exposes the full array at ctx.strategy.closedtrades for
 * indexed per-trade access (the JS equivalent of Pine's
 * strategy.closedtrades.profit(idx) etc.); this getter returns just the
 * count to match the script-side scalar.
 */
export function closedtrades(context: any) {
    return () => {
        return context.strategy?.closedtrades?.length ?? 0;
    };
}
