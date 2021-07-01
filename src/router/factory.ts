import {BigDecimal, BigInt} from "@graphprotocol/graph-ts";
import {Pool, Exchange} from "../types/router/schema";

import {PairCreated} from "../types/router/FactoryV2/UFactory";
import {SwapCreated} from "../types/router/StableFactory/SwapFactory";
import {Bytes} from "@graphprotocol/graph-ts/index";

export function handleNewPair(event: PairCreated): void {
  let exchange = getExchange("1");
  exchange.poolCount = exchange.poolCount + 1;
  exchange.save();

  //save token
  let tokensList: Array<Bytes> = [];
  let bindToken = event.params.token0;
  tokensList.push(Bytes.fromHexString(bindToken.toHexString()) as Bytes);
  bindToken = event.params.token1;
  tokensList.push(Bytes.fromHexString(bindToken.toHexString()) as Bytes);

  // save pair v2
  let pool = new Pool(event.params.pair.toHexString());
  pool.version = 3001;
  pool.exchangeID = exchange.id;
  pool.tokensList = tokensList;
  pool.save();
}

export function handleNewStableSwap(event: SwapCreated): void {
  let exchange = getExchange("2");
  exchange.poolCount = exchange.poolCount + 1;
  exchange.save();

  let poolId = event.params.swap.toHex();

  //save token
  let tokensList: Array<Bytes> = [];
  let bindTokens = event.params.pooledTokens;
  for (let i = 0; i < bindTokens.length; ++i) {
    let bindToken = bindTokens[i];
    tokensList.push(Bytes.fromHexString(bindToken.toHexString()) as Bytes);
  }

  // save pair v2
  let pool = new Pool(poolId);
  pool.version = 5001;
  pool.exchangeID = exchange.id;
  pool.tokensList = tokensList;
  pool.save();
}

function getExchange(id: string): Exchange | null {
  let factory = Exchange.load(id);
  if (factory === null) {
    factory = new Exchange(id);
    factory.poolCount = 0;
    factory.save();
  }
  return factory;
}
