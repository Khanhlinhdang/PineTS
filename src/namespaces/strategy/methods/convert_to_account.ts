// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

/**
 * Convert a value from the symbol's currency to the account currency.
 *
 * For the common same-currency case (e.g. BTCUSDC's quote currency USDC ≈ USD),
 * this is an identity. Genuine cross-currency conversion would require an FX
 * rate source which we don't model; returns the input unchanged in that case
 * with a console warning on first call.
 */
export function convert_to_account(context: any) {
    let warned = false;
    return (value: number) => {
        const s = context.strategy;
        const symCur = context.pine?.syminfo?.currency;
        const acctCur = s?.account_currency ?? 'USD';
        if (symCur && symCur !== acctCur && !warned) {
            // eslint-disable-next-line no-console
            console.warn(`strategy.convert_to_account: no FX rate for ${symCur}→${acctCur}; returning value unchanged.`);
            warned = true;
        }
        return value;
    };
}
