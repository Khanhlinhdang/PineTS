// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

/**
 * Count of currently-open trades. Matches Pine's strategy.opentrades.
 *
 * The result-state exposes the full array at ctx.strategy.opentrades for
 * indexed per-trade access (the JS equivalent of Pine's
 * strategy.opentrades.profit(idx) etc.); this getter returns just the
 * count to match the script-side scalar.
 */
export function opentrades(context: any) {
    return () => {
        return context.strategy?.opentrades?.length ?? 0;
    };
}
