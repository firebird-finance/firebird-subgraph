import {RouterExchange, Pool} from "../types/router/schema";
import {Exchange} from "../types/router/Router/Router";

export function handleExchangeV2(event: Exchange): void {
  handleExchange(event, 1);
}

export function handleExchangeV1(event: Exchange): void {
  handleExchange(event, 0);
}

function handleExchange(event: Exchange, version: i32): void {
  let id = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let pool = Pool.load(event.params.pair.toHexString());

  let swapExchange = new RouterExchange(id);
  swapExchange.isInPlatform = pool != null;
  swapExchange.version = version;
  swapExchange.pair = event.params.pair;
  swapExchange.token = event.params.output;
  swapExchange.amount = event.params.amountOut.toBigDecimal();
  swapExchange.userAddress = event.transaction.from;
  swapExchange.tx = event.transaction.hash;
  swapExchange.blockNumber = event.block.number;
  swapExchange.time = event.block.timestamp;
  swapExchange.save();
}
