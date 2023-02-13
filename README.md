# Binance Futures BOT

Binance Futures BOT is an automated trading robot specialized in Binance Futures trading.

## Installation

Use the package manager npm to install required packages.

```bash
npm install
```

## Basic Usage

Make sure the cross wallet has a certain amount of BUSD.

Replace `API_KEY` and `SECRET_KEY` in index.js with your own.

Start automated trading.

```bash
node index
```

## Strategy

This automatic trading strategy is improved based on the martingale strategy, take profit and stop loss of each order is 20%. If the stop loss, it will be automatically placed twice the quantity of the previous order, if the quantity exceeds the total funds, the initial quantity will be placed.

## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
