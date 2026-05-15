// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Alaa-eddine KADDOURI

import { Order, StrategyState, Trade } from './types';
import { Series } from '../../Series';

/**
 * Parse strategy() function arguments
 */
export function parseStrategyOptions(args: any[]): any {
    if (args.length === 0) return {};

    // If first arg is a string, it's the title
    if (typeof args[0] === 'string') {
        const options: any = { title: args[0] };

        // If second arg is object, merge it
        if (args.length > 1 && typeof args[1] === 'object') {
            return { ...options, ...args[1] };
        }

        return options;
    }

    // If first arg is object, use it directly
    if (typeof args[0] === 'object') {
        return args[0];
    }

    return {};
}

/**
 * Calculate order quantity based on strategy configuration
 */
export function calculateOrderQty(context: any, specifiedQty: number | undefined, direction: number, fillPrice: number): number {
    const strategy: StrategyState = context.strategy;

    // Get qty type and value, calling functions if needed
    let qtyType = strategy.config.default_qty_type || 'fixed';
    let qtyValue = strategy.config.default_qty_value || 1;

    // If qtyType is a function, call it to get the actual string value
    if (typeof qtyType === 'function') {
        qtyType = (qtyType as Function)();
    }

    // If qtyValue is a function, call it to get the actual numeric value
    if (typeof qtyValue === 'function') {
        qtyValue = (qtyValue as Function)();
    }

    if (specifiedQty !== undefined && specifiedQty !== null) {
        return Math.abs(specifiedQty);
    }

    switch (qtyType) {
        case 'fixed':
            return qtyValue;

        case 'cash':
            // Calculate how many units we can buy with the cash amount
            return qtyValue / fillPrice;

        case 'percent_of_equity':
            // Calculate quantity based on percentage of equity
            // qty_value=10 means 10% of equity
            const positionValue = (strategy.equity * qtyValue) / 100;
            const equityQty = positionValue / fillPrice;
            return equityQty;

        default:
            return qtyValue;
    }
}

/**
 * Process pending orders and execute them
 */
export function processStrategyOrders(context: any): void {
    if (!context.strategy) return;

    const strategy: StrategyState = context.strategy;
    const { pending_orders } = strategy;

    // Get current bar's OHLC data
    const openPrice = Series.from(context.data.open).get(0);
    const highPrice = Series.from(context.data.high).get(0);
    const lowPrice = Series.from(context.data.low).get(0);
    const closePrice = Series.from(context.data.close).get(0);
    const currentTime = Series.from(context.data.openTime).get(0);

    // Update unrealized P&L for open trades using OPEN price (for accurate equity at order execution time)
    updateUnrealizedPnL(context, openPrice);

    // Process each pending order that was placed on a previous bar
    for (const order of pending_orders) {
        if (order.status !== 'pending') continue;

        // Orders placed on bar N can only fill on bar N+1 or later
        // Skip if this order was placed on the current bar (context.idx)
        if (order.bar >= context.idx) {
            continue;
        }

        let shouldFill = false;
        let fillPrice = openPrice;

        // Determine if order should be filled based on type
        switch (order.type) {
            case 'market':
                // Market orders fill at current bar's open (which is "next bar's open" from order placement)
                shouldFill = true;
                fillPrice = openPrice;
                break;

            case 'limit':
                // Limit orders fill when price reaches the limit level
                if (order.limit !== undefined) {
                    const direction = parseDirection(order.direction);
                    if (direction === 1 && lowPrice <= order.limit) {
                        // Long limit order - buy when price drops to limit
                        shouldFill = true;
                        fillPrice = order.limit;
                    } else if (direction === -1 && highPrice >= order.limit) {
                        // Short limit order - sell when price rises to limit
                        shouldFill = true;
                        fillPrice = order.limit;
                    }
                }
                break;

            case 'stop':
                // Stop orders fill when price crosses the stop level
                if (order.stop !== undefined) {
                    const direction = parseDirection(order.direction);
                    if (direction === 1 && highPrice >= order.stop) {
                        // Long stop order - buy when price rises to stop
                        shouldFill = true;
                        fillPrice = order.stop;
                    } else if (direction === -1 && lowPrice <= order.stop) {
                        // Short stop order - sell when price falls to stop
                        shouldFill = true;
                        fillPrice = order.stop;
                    }
                }
                break;
        }

        if (shouldFill) {
            // Execute the order using the pre-calculated qty
            executeOrder(context, order, fillPrice, currentTime);
            order.status = 'filled';
            order.fill_price = fillPrice;
            order.fill_bar = context.idx;
            order.fill_time = currentTime;
        }
    }

    // Remove filled and cancelled orders
    strategy.pending_orders = pending_orders.filter((o) => o.status === 'pending');

    // Update strategy metrics using CLOSE price (for script access)
    updateUnrealizedPnL(context, closePrice);
    updateStrategyMetrics(context);
}

/**
 * Parse direction string/number to numeric value
 */
export function parseDirection(direction: number | string): number {
    if (typeof direction === 'number') return direction;
    if (direction === 'long') return 1;
    if (direction === 'short') return -1;
    return 0;
}

/**
 * Open a new trade.
 *
 * @param direction +1 long, -1 short
 * @param qty       unsigned contract count
 * @param price     fill price
 * @param time      fill time (ms)
 */
export function openTrade(context: any, entryId: string, direction: number, qty: number, price: number, time: number): void {
    const strategy: StrategyState = context.strategy;
    const tradeNum = strategy.opentrades.length + strategy.closedtrades.length;

    const trade: Trade = {
        id: `trade_${tradeNum}`,
        entry_id: entryId,
        entry_price: price,
        entry_bar_index: context.idx,
        entry_time: time,
        size: direction * qty,   // SIGNED — matches Pine's closedtrades.size()
        status: 'open',
    };

    strategy.opentrades.push(trade);

    // Update flat position scalars
    const oldSize = strategy.position_size;
    const newSize = oldSize + trade.size;

    if (oldSize === 0) {
        // Opening fresh position
        strategy.position_size = newSize;
        strategy.position_avg_price = price;
        strategy.position_entry_name = entryId;
    } else if (Math.sign(oldSize) === Math.sign(newSize)) {
        // Adding to existing same-direction position — weighted-avg the entry price
        const totalCost = Math.abs(oldSize) * strategy.position_avg_price + qty * price;
        const totalQty = Math.abs(newSize);
        strategy.position_avg_price = totalCost / totalQty;
        strategy.position_size = newSize;
    }
}

/**
 * Execute an order
 * strategy.order() modifies the net position directly
 */
function executeOrder(context: any, order: Order, fillPrice: number, fillTime: number): void {
    const strategy: StrategyState = context.strategy;
    const direction = parseDirection(order.direction);
    const oldPosition = strategy.position_size;
    const oldSign = Math.sign(oldPosition);

    // Check if we are reducing/reversing the position
    // (Long position and selling, or Short position and buying)
    const isReducing = (oldSign === 1 && direction === -1) || (oldSign === -1 && direction === 1);

    if (isReducing) {
        // We are reducing or reversing
        // First, use the order to close existing trades
        const qtyToClose = Math.min(Math.abs(oldPosition), order.qty);
        closePartialPosition(context, qtyToClose, fillPrice, fillTime);

        // If there is remaining quantity (reversal), open a new trade
        const remainingQty = order.qty - qtyToClose;
        if (remainingQty > 0) {
            openTrade(context, order.id, direction, remainingQty, fillPrice, fillTime);
        }
    } else {
        // We are increasing position or opening fresh
        openTrade(context, order.id, direction, order.qty, fillPrice, fillTime);
    }
}

/**
 * Close partial or full position.
 *
 * FIFO accounting: closes oldest open trades first. Splits a trade if the
 * close qty is smaller than the trade's remaining qty.
 */
export function closePartialPosition(context: any, qtyToClose: number, exitPrice: number, exitTime: number): void {
    const strategy: StrategyState = context.strategy;
    let remainingQty = qtyToClose;

    // Close trades from oldest to newest (FIFO)
    const tradesToClose = [...strategy.opentrades];
    strategy.opentrades = [];

    for (const trade of tradesToClose) {
        if (remainingQty <= 0) {
            // Keep this trade open
            strategy.opentrades.push(trade);
            continue;
        }

        const tradeQty = Math.abs(trade.size);
        const qtyClosing = Math.min(tradeQty, remainingQty);
        const tradeDirection = Math.sign(trade.size);

        if (qtyClosing >= tradeQty) {
            // Fully close this trade
            trade.status = 'closed';
            trade.exit_price = exitPrice;
            trade.exit_bar_index = context.idx;
            trade.exit_time = exitTime;

            // Calculate profit (direction-aware)
            const priceChange = tradeDirection === 1 ? exitPrice - trade.entry_price : trade.entry_price - exitPrice;
            trade.profit = priceChange * tradeQty;

            // Update gross profit/loss
            if (trade.profit > 0) {
                strategy.grossprofit += trade.profit;
            } else {
                strategy.grossloss += Math.abs(trade.profit);
            }

            strategy.closedtrades.push(trade);
            remainingQty -= qtyClosing;
        } else {
            // Partially close this trade — split it into a closed portion + remaining open portion
            const tradeNum = strategy.opentrades.length + strategy.closedtrades.length;
            const closedPortion: Trade = {
                ...trade,
                id: `trade_${tradeNum}`,
                size: tradeDirection * qtyClosing,
                status: 'closed',
                exit_price: exitPrice,
                exit_bar_index: context.idx,
                exit_time: exitTime,
            };

            // Calculate profit for closed portion (direction-aware)
            const priceChange = tradeDirection === 1 ? exitPrice - trade.entry_price : trade.entry_price - exitPrice;
            closedPortion.profit = priceChange * qtyClosing;

            // Update gross profit/loss
            if (closedPortion.profit > 0) {
                strategy.grossprofit += closedPortion.profit;
            } else {
                strategy.grossloss += Math.abs(closedPortion.profit);
            }

            strategy.closedtrades.push(closedPortion);

            // Reduce the remaining portion (still open) by the closed qty, preserving direction sign
            trade.size = tradeDirection * (tradeQty - qtyClosing);
            strategy.opentrades.push(trade);
            remainingQty = 0;
        }
    }

    // Update net profit
    strategy.netprofit = strategy.grossprofit - strategy.grossloss;

    // Update flat position scalars from the (possibly shrunken) open-trade book
    const currentSize = strategy.position_size;
    const sizeReduction = Math.sign(currentSize) * qtyToClose; // Reduce magnitude
    const newSize = currentSize - sizeReduction;

    strategy.position_size = newSize;

    if (newSize === 0) {
        strategy.position_avg_price = NaN;
        strategy.position_entry_name = '';
    } else if (strategy.opentrades.length > 0) {
        // Recompute average entry price from remaining open trades.
        // Crucial because closing older trades (FIFO) changes the weighted
        // average if the position was built from multiple entries at
        // different prices.
        let totalCost = 0;
        let totalQty = 0;
        for (const t of strategy.opentrades) {
            const tQty = Math.abs(t.size);
            totalCost += tQty * t.entry_price;
            totalQty += tQty;
        }
        strategy.position_avg_price = totalCost / totalQty;
        // position_entry_name keeps pointing at whichever entry opened the
        // first still-open trade
        strategy.position_entry_name = strategy.opentrades[0].entry_id;
    }
}

/**
 * Update unrealized P&L for open trades + the openprofit/equity scalars.
 */
function updateUnrealizedPnL(context: any, currentPrice: number): void {
    const strategy: StrategyState = context.strategy;

    let unrealizedPnL = 0;
    for (const trade of strategy.opentrades) {
        const tradeQty = Math.abs(trade.size);
        const tradeDirection = Math.sign(trade.size);
        const priceChange = tradeDirection === 1 ? currentPrice - trade.entry_price : trade.entry_price - currentPrice;
        unrealizedPnL += priceChange * tradeQty;
    }

    strategy.openprofit = unrealizedPnL;
    strategy.equity = strategy.initial_capital + strategy.netprofit + unrealizedPnL;
}

/**
 * Update strategy metrics
 */
function updateStrategyMetrics(context: any): void {
    const strategy: StrategyState = context.strategy;

    // Net profit is already calculated when trades close.
    // Equity is updated with unrealized P&L.
    // Equity-curve peaks (max_drawdown / max_runup) and aggregate
    // win/loss stats are deferred to a later pass when those scalar
    // getters are implemented.
    void strategy;
}

/**
 * Initialize strategy state
 */
export function initializeStrategy(context: any, config: any): void {
    const defaults = {
        title: '',
        shorttitle: '',
        overlay: false,
        format: 'inherit',
        precision: 10,
        scale: 'right',
        pyramiding: 1,
        calc_on_order_fills: false,
        calc_on_every_tick: false,
        max_bars_back: 0,
        backtest_fill_limits_assumption: 0,
        default_qty_type: 'fixed',
        default_qty_value: 1,
        initial_capital: 1000000,
        currency: 'USD',
        slippage: 0,
        commission_type: 'percent',
        commission_value: 0,
        margin_long: 100,
        margin_short: 100,
        explicit_plot_zorder: false,
        max_lines_count: 50,
        max_labels_count: 50,
        max_boxes_count: 50,
        max_polylines_count: 50,
        risk_free_rate: 2,
        use_bar_magnifier: false,
        fill_orders_on_standard_ohlc: false,
    };

    const finalConfig = { ...defaults, ...config };
    const initialCapital = finalConfig.initial_capital;

    context.strategy = {
        config: finalConfig,

        // Trade collections
        opentrades: [],
        closedtrades: [],
        pending_orders: [],

        // Flat position scalars
        position_size: 0,
        position_avg_price: NaN,        // Pine returns NaN when flat
        position_entry_name: '',

        // Account info
        initial_capital: initialCapital,
        account_currency: finalConfig.currency || 'USD',
        equity: initialCapital,
        netprofit: 0,
        grossprofit: 0,
        grossloss: 0,
        openprofit: 0,

        // Peaks
        max_drawdown: 0,
        max_runup: 0,
        equity_peak: initialCapital,
        equity_trough: initialCapital,
    };
}
