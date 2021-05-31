import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import { LPPoolToken, Pool, PoolInfo } from "../types/exchange/schema";
import {
  PairV2 as PairTemplate,
  StableLP as StableLPTemplate,
  StableSwap as StableSwapTemplate,
} from "../types/exchange/templates";
import {
  createPoolTokenEntity,
  createTokenEntity,
  createUserEntity,
  getExchange, ONE_BD,
  tokenToDecimal,
  updateStablePoolLiquidity,
  ZERO_BD
} from "./helpers";
import { PairCreated, UFactory as UFactoryContract } from "../types/exchange/FactoryV2/UFactory";
import { SwapCreated } from "../types/exchange/StableFactory/SwapFactory";
import { Bytes } from "@graphprotocol/graph-ts/index";
import { Swap as SwapSmartContract } from "../types/exchange/StableFactory/Swap";

export function handleNewPair(event: PairCreated): void {
  let exchange = getExchange("1");
  let factoryContract = UFactoryContract.bind(event.address);
  let protocolFee = factoryContract.protocolFee().toBigDecimal();
  exchange.protocolFee = ONE_BD.div(protocolFee.div(BigDecimal.fromString("1000")));
  exchange.poolCount = exchange.poolCount + 1;
  exchange.save();

  //save token
  let tokensList: Array<Bytes> = [];

  let bindToken = event.params.token0;
  tokensList.push(Bytes.fromHexString(bindToken.toHexString()) as Bytes);

  let poolTokenId = event.params.pair
    .toHexString()
    .concat("-")
    .concat(bindToken.toHexString());
  let poolToken = createPoolTokenEntity(poolTokenId, event.params.pair.toHexString(), bindToken.toHexString());
  poolToken.balance = ZERO_BD;
  poolToken.denormWeight = event.params.tokenWeight0.toBigDecimal();
  poolToken.tokenIndex = 0;
  poolToken.save();

  bindToken = event.params.token1;
  tokensList.push(Bytes.fromHexString(bindToken.toHexString()) as Bytes);

  poolTokenId = event.params.pair
    .toHexString()
    .concat("-")
    .concat(bindToken.toHexString());
  poolToken = createPoolTokenEntity(poolTokenId, event.params.pair.toHexString(), bindToken.toHexString());
  poolToken.balance = ZERO_BD;
  poolToken.denormWeight = BigDecimal.fromString("100").minus(event.params.tokenWeight0.toBigDecimal());
  poolToken.tokenIndex = 1;
  poolToken.save();

  // save pair v2
  let pool = new Pool(event.params.pair.toHexString());
  pool.version = 3001;
  pool.totalShares = ZERO_BD;
  pool.totalSwapVolume = ZERO_BD;
  pool.totalSwapFee = ZERO_BD;
  pool.liquidity = ZERO_BD;
  pool.holdersCount = BigInt.fromI32(0);
  pool.txCount = BigInt.fromI32(0);
  createUserEntity(event.transaction.from.toHexString());
  pool.save();

  //save poolInfo v2
  let poolInfo = new PoolInfo(event.params.pair.toHexString());
  poolInfo.swapFee = tokenToDecimal(event.params.swapFee.toBigDecimal(), 3);
  poolInfo.adminFee = ZERO_BD;
  poolInfo.totalWeight = BigDecimal.fromString("100");
  poolInfo.tokensList = tokensList;
  poolInfo.createTime = event.block.timestamp.toI32();
  poolInfo.tokensCount = BigInt.fromI32(2);
  poolInfo.exchangeID = exchange.id;
  poolInfo.poolId = pool.id;
  poolInfo.tx = event.transaction.hash;
  poolInfo.creatorAddress = event.transaction.from.toHexString();
  poolInfo.save();

  // create the tracked contract based on the template
  PairTemplate.create(event.params.pair);
}

export function handleNewStableSwap(event: SwapCreated): void {
  let factory = getExchange("2");
  factory.poolCount = factory.poolCount + 1;
  factory.save();

  let poolId = event.params.swap.toHex();

  //save token
  let tokensList: Array<Bytes> = [];
  let bindTokens = event.params.pooledTokens;

  for (let i = 0; i < bindTokens.length; ++i) {
    let bindToken = bindTokens[i];
    tokensList.push(Bytes.fromHexString(bindToken.toHexString()) as Bytes);

    let poolTokenId = poolId.concat("-").concat(bindToken.toHexString());
    let poolToken = createPoolTokenEntity(poolTokenId, poolId, bindToken.toHexString());
    poolToken.denormWeight = ZERO_BD;
    poolToken.balance = ZERO_BD;
    poolToken.tokenIndex = i;
    poolToken.save();
  }

  let poolContract = SwapSmartContract.bind(event.params.swap);

  // save pair v2
  let pool = new Pool(poolId);
  let swapInfoCall = poolContract.try_swapStorage();
  if (!swapInfoCall.reverted) {
    let token = createTokenEntity(swapInfoCall.value.value7.toHex());
    token.isVpeg = true;
    token.poolTokenId = poolId;
    token.save();
    let lpPoolToken = new LPPoolToken(token.id);
    lpPoolToken.symbol = token.symbol;
    lpPoolToken.name = token.name;
    lpPoolToken.decimals = token.decimals;
    lpPoolToken.poolId = poolId;
    lpPoolToken.save();

    StableLPTemplate.create(swapInfoCall.value.value7);
  }
  pool.version = 5001;
  pool.totalShares = ZERO_BD;
  pool.totalSwapVolume = ZERO_BD;
  pool.totalSwapFee = ZERO_BD;
  pool.liquidity = ZERO_BD;
  pool.holdersCount = BigInt.fromI32(0);
  pool.txCount = BigInt.fromI32(0);
  createUserEntity(event.transaction.from.toHexString());

  // save stable poolInfo
  let poolInfo = new PoolInfo(poolId);
  if (!swapInfoCall.reverted) {
    poolInfo.swapFee = tokenToDecimal(swapInfoCall.value.value4.toBigDecimal(), 10);
    poolInfo.adminFee = tokenToDecimal(swapInfoCall.value.value5.toBigDecimal(), 10);
    poolInfo.withdrawFee = tokenToDecimal(swapInfoCall.value.value6.toBigDecimal(), 10);
    poolInfo.lpAddress = swapInfoCall.value.value7.toHex();
  }
  poolInfo.totalWeight = ZERO_BD;
  poolInfo.createTime = event.block.timestamp.toI32();
  poolInfo.tokensCount = BigInt.fromI32(bindTokens.length);
  poolInfo.exchangeID = factory.id;
  poolInfo.poolId = poolId;
  poolInfo.tokensList = tokensList;
  poolInfo.tx = event.transaction.hash;
  poolInfo.creatorAddress = event.transaction.from.toHexString();
  let ownerCall = poolContract.try_owner();
  if (!ownerCall.reverted) {
    poolInfo.timelock = ownerCall.value;
  }
  poolInfo.save();

  updateStablePoolLiquidity(pool);

  // create the tracked contract based on the template
  StableSwapTemplate.create(event.params.swap);
}
