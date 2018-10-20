'use strict';

let orderUtil = require('../../utils/order_util')

module.exports = class ExchangeOrderWatchdogListener {
    constructor(exchangeManager, instances, stopLossCalculator, logger) {
        this.exchangeManager = exchangeManager
        this.instances = instances
        this.logger = logger
        this.stopLossCalculator = stopLossCalculator
    }

    onTick() {
        let instances = this.instances

        this.exchangeManager.all().forEach(exchange => {
            let positions = exchange.getPositions()

            if (positions.length === 0) {
                return
            }

            positions.forEach((position) => {
                let pair = instances.symbols.find(
                    instance => instance.exchange === exchange.getName() && instance.symbol === position.symbol
                )


                if (!pair || !pair.watchdogs) {
                    return
                }

                let names = pair.watchdogs.map((watchdog) => watchdog.name)

                if (names.indexOf('stoploss') >= 0) {
                    this.stopLossWatchdog(exchange, position)
                }
            })
        })
    }

    async stopLossWatchdog(exchange, position) {
        let logger = this.logger
        let stopLossCalculator = this.stopLossCalculator

        let orderChanges = orderUtil.syncStopLossOrder(position, exchange.getOrdersForSymbol(position.symbol));

        orderChanges.forEach(async orderChange => {
            logger.info('Stoploss update' + JSON.stringify({
                'order': orderChange,
                'symbol': position.symbol,
                'exchange': exchange.getName(),
            }))

            if (orderChange.id) {
                // update
                exchange.updateOrder(orderChange.id, {
                    'amount': orderChange.amount,
                })
            } else {
                // create

                let price = await stopLossCalculator.calculateForOpenPosition(exchange.getName(), position)
                if (!price) {
                    console.log('Stop loss: auto price skipping')
                    return
                }

                price = exchange.formatPrice(price, position.symbol)
                if (!price) {
                    console.log('Stop loss: auto price skipping')
                    return
                }

                try {
                    exchange.order({
                        'symbol': position.symbol,
                        'price': exchange.formatPrice(price, position.symbol),
                        'amount': orderChange.amount,
                        'type': 'stop'
                    })
                } catch(e) {
                    let msg = 'Stoploss update' + JSON.stringify({
                        'error': e,
                    });

                    logger.error(msg)
                    console.error(msg)
                }
            }
        })
    }
}