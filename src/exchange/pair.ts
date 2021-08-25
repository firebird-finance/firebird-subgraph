/* eslint-disable prefer-const */
import { BigInt, BigDecimal, store } from "@graphprotocol/graph-ts";
import { Token, Pool, PoolToken, PoolShare, Swap as SwapModel, PoolInfo } from "../types/exchange/schema";
import { Mint, Burn, Swap, Transfer, Sync } from "../types/exchange/templates/PairV2/PairV2";
import {
  ONE_BI,
  ZERO_BD,
  tokenToDecimal,
  updatePoolLiquidity,
  createPoolShareEntity,
  saveTransaction,
  getTrackedVolumeUSD, SAVE_SWAP_FROM, getExchange
} from "./helpers";
import { Bytes } from "@graphprotocol/graph-ts/index";
import { updateVolumeStats, SwapInfo, updateTokenDayData } from "./dayUpdates";

export function handleTransfer(event: Transfer): void {
  let ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

  // ignore initial transfers for first adds
  if (event.params.to.toHexString() == ADDRESS_ZERO && event.params.value.equals(BigInt.fromI32(1000))) {
    return;
  }

  let poolId = event.address.toHex();
  let from = event.params.from;
  let to = event.params.to;
  // liquidity token amount being transfered
  let value = tokenToDecimal(event.params.value.toBigDecimal(), 18);

  // get pair and load contract
  let pool = Pool.load(poolId);

  let poolShareFromId = poolId.concat("-").concat(from.toHex());
  let poolShareFrom = PoolShare.load(poolShareFromId);
  let poolShareFromBalance = poolShareFrom == null ? ZERO_BD : poolShareFrom.balance;

  let poolShareToId = poolId.concat("-").concat(to.toHex());
  let poolShareTo = PoolShare.load(poolShareToId);
  let poolShareToBalance = poolShareTo == null ? ZERO_BD : poolShareTo.balance;

  let isMint = from.toHexString() == ADDRESS_ZERO;
  let isBurn = to.toHexString() == ADDRESS_ZERO;

  if (isMint) {
    if (poolShareTo == null) {
      createPoolShareEntity(poolShareToId, poolId, to.toHex());
      poolShareTo = PoolShare.load(poolShareToId);
    }
    poolShareTo.balance = poolShareTo.balance.plus(value);
    poolShareTo.save();
    pool.totalShares = pool.totalShares.plus(value);
  } else if (isBurn) {
    if (poolShareFrom == null) {
      createPoolShareEntity(poolShareFromId, poolId, from.toHex());
      poolShareFrom = PoolShare.load(poolShareFromId);
    }
    poolShareFrom.balance = poolShareFrom.balance.minus(value);
    if (poolShareFrom.balance.le(ZERO_BD)) {
      store.remove("PoolShare", poolShareFrom.id);
    } else {
      poolShareFrom.save();
    }
    pool.totalShares = pool.totalShares.minus(value);
  } else {
    if (poolShareTo == null) {
      createPoolShareEntity(poolShareToId, poolId, to.toHex());
      poolShareTo = PoolShare.load(poolShareToId);
    }
    poolShareTo.balance = poolShareTo.balance.plus(value);
    poolShareTo.save();

    if (poolShareFrom == null) {
      createPoolShareEntity(poolShareFromId, poolId, from.toHex());
      poolShareFrom = PoolShare.load(poolShareFromId);
    }
    poolShareFrom.balance = poolShareFrom.balance.minus(value);
    if (poolShareFrom.balance.le(ZERO_BD)) {
      store.remove("PoolShare", poolShareFrom.id);
    } else {
      poolShareFrom.save();
    }
  }

  if (poolShareTo !== null && poolShareTo.balance.notEqual(ZERO_BD) && poolShareToBalance.equals(ZERO_BD)) {
    pool.holdersCount = pool.holdersCount.plus(BigInt.fromI32(1));
  }

  if (poolShareFrom !== null && poolShareFrom.balance.equals(ZERO_BD) && poolShareFromBalance.notEqual(ZERO_BD)) {
    pool.holdersCount = pool.holdersCount.minus(BigInt.fromI32(1));
  }

  pool.save();
}

export function handleSync(event: Sync): void {
  let poolId = event.address.toHex();
  let pool = Pool.load(poolId);
  let poolInfo = PoolInfo.load(poolId);

  let tokensList: Array<Bytes> = poolInfo.tokensList;

  let address0 = tokensList[0].toHexString();
  let poolTokenId = poolId.concat("-").concat(address0.toString());
  let poolToken0 = PoolToken.load(poolTokenId);
  poolToken0.balance = tokenToDecimal(event.params.reserve0.toBigDecimal(), poolToken0.decimals);
  poolToken0.save();

  let address1 = tokensList[1].toHexString();
  poolTokenId = poolId.concat("-").concat(address1.toString());
  let poolToken1 = PoolToken.load(poolTokenId);
  poolToken1.balance = tokenToDecimal(event.params.reserve1.toBigDecimal(), poolToken1.decimals);
  poolToken1.save();

  updatePoolLiquidity(pool!);
}

export function handleMint(event: Mint): void {
  let poolId = event.address.toHex();
  let pool = Pool.load(poolId);
  pool.txCount = pool.txCount.plus(ONE_BI);
  pool.save();
}

export function handleBurn(event: Burn): void {
  let poolId = event.address.toHex();
  let pool = Pool.load(poolId);
  pool.txCount = pool.txCount.plus(ONE_BI);
  pool.save();
}

export function handleSwap(event: Swap): void {
  let poolId = event.address.toHex();
  let pool = Pool.load(poolId);
  let poolInfo = PoolInfo.load(poolId);
  let factory = getExchange(poolInfo.exchangeID);
  let tokensList: Array<Bytes> = poolInfo.tokensList;
  let address0 = tokensList[0].toHex();
  let address1 = tokensList[1].toHex();

  let token0 = Token.load(address0);
  let token1 = Token.load(address1);
  let amount0In = tokenToDecimal(event.params.amount0In.toBigDecimal(), token0.decimals);
  let amount1In = tokenToDecimal(event.params.amount1In.toBigDecimal(), token1.decimals);
  let amount0Out = tokenToDecimal(event.params.amount0Out.toBigDecimal(), token0.decimals);
  let amount1Out = tokenToDecimal(event.params.amount1Out.toBigDecimal(), token1.decimals);

  // totals for volume updates
  let amount0Total = amount0Out.plus(amount0In);
  let amount1Total = amount1Out.plus(amount1In);

  let totalSwapVolume = pool.totalSwapVolume;
  let totalSwapFee = pool.totalSwapFee;

  let swap1Value = getTrackedVolumeUSD(amount0Out, token0!, amount1In, token1!);
  let swap2Value = getTrackedVolumeUSD(amount1Out, token1!, amount0In, token0!);
  let swapValue = swap1Value.plus(swap2Value);
  let swapFeeValue = swapValue.times(poolInfo.swapFee);
  let collectedToken0Fund = swap2Value.times(factory.protocolFee).times(poolInfo.swapFee);
  let collectedToken1Fund = swap1Value.times(factory.protocolFee).times(poolInfo.swapFee);
  let totalProtocolFee = collectedToken0Fund.plus(collectedToken1Fund);
  totalSwapVolume = totalSwapVolume.plus(swapValue);
  totalSwapFee = totalSwapFee.plus(swapFeeValue);

  token0.tradeVolume = token0.tradeVolume.plus(amount0Total);
  let tokenAmount0USD = amount0Total.times(token0.priceUSD);
  token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(tokenAmount0USD);

  token1.tradeVolume = token1.tradeVolume.plus(amount1Total);
  let tokenAmount1USD = amount1Total.times(token1.priceUSD);
  token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(tokenAmount1USD);

  updateTokenDayData(token0!, event, amount0Total, tokenAmount0USD, ZERO_BD);
  updateTokenDayData(token1!, event, amount1Total, tokenAmount1USD, ZERO_BD);

  token0.txCount = token0.txCount.plus(ONE_BI);
  token0.totalProtocolFee = token0.totalProtocolFee.plus(collectedToken0Fund);
  token1.txCount = token1.txCount.plus(ONE_BI);
  token1.totalProtocolFee = token1.totalProtocolFee.plus(collectedToken1Fund);

  token0.save();
  token1.save();
  pool.totalSwapVolume = totalSwapVolume;
  pool.totalSwapFee = totalSwapFee;
  pool.txCount = pool.txCount.plus(ONE_BI);


  if (SAVE_SWAP_FROM.lt(event.block.number)) {
    let isToken0In = amount0In.gt(BigDecimal.fromString("0"));
    let swapId = event.transaction.hash
      .toHexString()
      .concat("-")
      .concat(event.logIndex.toString());
    let swap = new SwapModel(swapId);
    swap.caller = event.params.sender;
    swap.tx = event.transaction.hash
    swap.tokenIn = isToken0In ? tokensList[0] : tokensList[1];
    swap.tokenInSym = isToken0In ? token0.symbol : token1.symbol;
    swap.tokenOut = isToken0In ? tokensList[1] : tokensList[0];
    swap.tokensList = [tokensList[0], tokensList[1]];
    swap.tokenOutSym = isToken0In ? token1.symbol : token0.symbol;
    swap.tokenAmountIn = isToken0In ? amount0In : amount1In;
    swap.tokenAmountOut = isToken0In ? amount1Out : amount0Out;
    swap.poolAddress = event.address.toHex();
    swap.userAddress = event.transaction.from.toHex();
    swap.value = swapValue;
    swap.feeValue = swapFeeValue;
    swap.protocolFeeValue = totalProtocolFee;
    swap.timestamp = event.block.timestamp.toI32();
    swap.save();
  }
  pool.save();
  saveTransaction(event, "swap");

  updateVolumeStats(pool!, poolInfo!, new SwapInfo(event, swapValue, swapFeeValue, totalProtocolFee));

}
