// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

import { Order } from '../types';
import { Series } from '../../../Series';
import { parseArgsForPineParams } from '../../utils';

/**
 * Close all trades opened by entries with the given id at market.
 *
 * Pine signature:
 *   strategy.close(id, comment, qty, qty_percent, alert_message,
 *                  immediately, disable_alert) → void
 *
 * Behavior:
 *   - Queues a market exit order tagged with the matching entry id and an
 *     optional qty / qty_percent partial. The fill happens on the next bar's
 *     open (or current bar's close if `immediately=true` AND the script
 *     declared `process_orders_on_close=true`).
 *   - `qty` and `qty_percent` apply to the SUM of contracts open from the
 *     matching entries (FIFO across multiple stacked entries with same id).
 */
const CLOSE_SIGNATURES = [
    ['id', 'comment', 'qty', 'qty_percent', 'alert_message', 'immediately', 'disable_alert'],
];
const CLOSE_ARGS_TYPES = {
    id: 'string',
    comment: 'string',
    qty: 'series',
    qty_percent: 'series',
    alert_message: 'string',
    immediately: 'boolean',
    disable_alert: 'boolean',
};

export function close(context: any) {
    return (...args: any[]) => {
        if (!context.strategy) {
            throw new Error('strategy.close() called before strategy() declaration');
        }
        const parsed = parseArgsForPineParams<any>(args, CLOSE_SIGNATURES, CLOSE_ARGS_TYPES);
        const targetId = parsed.id;
        if (targetId === undefined || targetId === null) return;

        const order: Order = {
            id: `close_${targetId}`,
            direction: 0, // resolved at fill time from matching position sign
            qty: 0,       // resolved at fill time from matching trades
            type: 'market',
            bar: context.idx,
            time: Series.from(context.data.openTime).get(0),
            status: 'pending',
            category: 'exit',
            from_entry: targetId,
            qty_percent: parsed.qty_percent,
            comment: parsed.comment,
            alert_message: parsed.alert_message,
            immediately: parsed.immediately === true,
            disable_alert: parsed.disable_alert,
        };
        // Resolve qty: if a fixed qty was passed it locks in here; otherwise
        // the engine computes from the matching position at fill time.
        if (parsed.qty !== undefined) order.qty = Math.abs(Number(parsed.qty));

        context.strategy.pending_orders.push(order);
    };
}
