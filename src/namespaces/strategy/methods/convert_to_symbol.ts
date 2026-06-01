// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

/**
 * Inverse of convert_to_account: from account currency → symbol currency.
 * Same identity passthrough for matching-currency case.
 */
export function convert_to_symbol(context: any) {
    let warned = false;
    return (value: number) => {
        const s = context.strategy;
        const symCur = context.pine?.syminfo?.currency;
        const acctCur = s?.account_currency ?? 'USD';
        if (symCur && symCur !== acctCur && !warned) {
            // eslint-disable-next-line no-console
            console.warn(`strategy.convert_to_symbol: no FX rate for ${acctCur}→${symCur}; returning value unchanged.`);
            warned = true;
        }
        return value;
    };
}
