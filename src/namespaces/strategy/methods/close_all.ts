// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

import { Order } from '../types';
import { Series } from '../../../Series';
import { parseArgsForPineParams } from '../../utils';

/**
 * Close ALL open positions at market, regardless of which entry opened them.
 *
 * Pine signature:
 *   strategy.close_all(comment, alert_message, immediately, disable_alert) → void
 */
const CLOSE_ALL_SIGNATURES = [['comment', 'alert_message', 'immediately', 'disable_alert']];
const CLOSE_ALL_ARGS_TYPES = {
    comment: 'string',
    alert_message: 'string',
    immediately: 'boolean',
    disable_alert: 'boolean',
};

export function close_all(context: any) {
    return (...args: any[]) => {
        if (!context.strategy) {
            throw new Error('strategy.close_all() called before strategy() declaration');
        }
        const parsed = parseArgsForPineParams<any>(args, CLOSE_ALL_SIGNATURES, CLOSE_ALL_ARGS_TYPES);

        const order: Order = {
            id: 'close_all',
            direction: 0, // resolved at fill time
            qty: 0,       // resolved at fill time (sum of |all open trades|)
            type: 'market',
            bar: context.idx,
            time: Series.from(context.data.openTime).get(0),
            status: 'pending',
            category: 'exit',
            from_entry: '',   // empty == match-all
            comment: parsed.comment,
            alert_message: parsed.alert_message,
            immediately: parsed.immediately === true,
            disable_alert: parsed.disable_alert,
        };
        context.strategy.pending_orders.push(order);
    };
}
