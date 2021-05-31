import {RouterExchange} from "../types/router/schema";
import {Exchange} from "../types/router/Router/Router";

export function handleExchange(event: Exchange): void {
  let id = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let swapExchange = new RouterExchange(id);
  swapExchange.pair = event.params.pair;
  swapExchange.token = event.params.output;
  swapExchange.amount = event.params.amountOut.toBigDecimal();
  swapExchange.userAddress = event.transaction.from;
  swapExchange.tx = event.transaction.hash;
  swapExchange.blockNumber = event.block.number;
  swapExchange.time = event.block.timestamp;
  swapExchange.save();
}
