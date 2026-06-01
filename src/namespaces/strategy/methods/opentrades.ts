// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

import { Trade } from '../types';

/**
 * Pine's `strategy.opentrades` mirrors strategy.closedtrades' dual-role
 * pattern — see that file's header for the rationale.
 *
 *   strategy.opentrades            → scalar count via valueOf
 *   strategy.opentrades.profit(0)  → per-trade unrealized P&L
 *   strategy.opentrades.capital_held → property (sum of held capital)
 */
export function opentrades(context: any) {
    return () => {
        // SNAPSHOT the open-trades list AT CALL TIME (see closedtrades.ts for
        // the rationale — per-bar plot values must capture per-bar state).
        const live: Trade[] = context.strategy?.opentrades ?? [];
        const list: Trade[] = live.slice();
        const at = (i: any): Trade | undefined => list[Number(i)];
        const currentPrice = (): number => {
            const md = context.marketData;
            if (Array.isArray(md) && context.idx >= 0 && context.idx < md.length) {
                return md[context.idx]?.close ?? NaN;
            }
            return NaN;
        };

        const result: any = {
            valueOf() { return list.length; },
            toString() { return String(list.length); },
            [Symbol.toPrimitive]() { return list.length; },
        };

        result.profit = (i: any) => {
            const t = at(i);
            if (!t) return NaN;
            const cp = currentPrice();
            if (!Number.isFinite(cp)) return NaN;
            const dir = Math.sign(t.size);
            const priceChange = dir === 1 ? cp - t.entry_price : t.entry_price - cp;
            return priceChange * Math.abs(t.size) - (t.commission ?? 0);
        };
        result.profit_percent = (i: any) => {
            const t = at(i);
            if (!t) return NaN;
            const p = result.profit(i);
            if (!Number.isFinite(p)) return NaN;
            const notional = Math.abs(t.size) * t.entry_price;
            return notional > 0 ? (100 * p) / notional : NaN;
        };
        result.size = (i: any) => at(i)?.size ?? NaN;
        result.commission = (i: any) => at(i)?.commission ?? NaN;
        result.entry_price = (i: any) => at(i)?.entry_price ?? NaN;
        result.entry_bar_index = (i: any) => at(i)?.entry_bar_index ?? NaN;
        result.entry_id = (i: any) => at(i)?.entry_id ?? '';
        result.entry_comment = (i: any) => at(i)?.entry_comment ?? '';
        result.entry_time = (i: any) => at(i)?.entry_time ?? NaN;
        result.max_drawdown = (i: any) => at(i)?.max_drawdown ?? 0;
        result.max_drawdown_percent = (i: any) => {
            const t = at(i);
            if (!t || !t.max_drawdown) return 0;
            const notional = Math.abs(t.size) * t.entry_price;
            return notional > 0 ? (100 * t.max_drawdown) / notional : 0;
        };
        result.max_runup = (i: any) => at(i)?.max_runup ?? 0;
        result.max_runup_percent = (i: any) => {
            const t = at(i);
            if (!t || !t.max_runup) return 0;
            const notional = Math.abs(t.size) * t.entry_price;
            return notional > 0 ? (100 * t.max_runup) / notional : 0;
        };

        // capital_held: total capital tied up by all open trades, respecting
        // margin%. Pine exposes this as a PROPERTY (not method), evaluated
        // on access. Returned as a number here.
        const s = context.strategy;
        // Pine returns `na` (NaN) for capital_held when no open trades.
        if (!s || s.opentrades.length === 0) {
            result.capital_held = NaN;
        } else {
            let totalHeld = 0;
            for (const t of s.opentrades) {
                const notional = Math.abs(t.size) * t.entry_price;
                const marginPct = t.size > 0 ? (s.config.margin_long ?? 100) : (s.config.margin_short ?? 100);
                totalHeld += notional * (marginPct / 100);
            }
            result.capital_held = totalHeld;
        }

        return result;
    };
}
