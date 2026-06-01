// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

/**
 * Price at which the current leveraged position would be force-liquidated.
 * Returns NaN when flat or when the relevant margin% is 100 (no leverage).
 *
 * Formula (simplified):
 *   long  → entry_avg_price * (1 - margin_long / 100)
 *   short → entry_avg_price * (1 + margin_short / 100)
 *
 * This is the simple peak-loss-tolerable price; real broker liquidation
 * depends on maintenance margin schedules which we don't model.
 * Matches Pine's strategy.margin_liquidation_price in the common case.
 */
export function margin_liquidation_price(context: any) {
    return () => {
        const s = context.strategy;
        if (!s || s.position_size === 0) return NaN;
        const avgPrice = s.position_avg_price;
        if (!Number.isFinite(avgPrice)) return NaN;

        if (s.position_size > 0) {
            const marginLong = s.config.margin_long ?? 100;
            if (marginLong >= 100) return NaN;
            return avgPrice * (1 - marginLong / 100);
        } else {
            const marginShort = s.config.margin_short ?? 100;
            if (marginShort >= 100) return NaN;
            return avgPrice * (1 + marginShort / 100);
        }
    };
}
