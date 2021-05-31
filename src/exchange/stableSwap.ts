import { Address, BigDecimal, BigInt, store } from "@graphprotocol/graph-ts";
import { LPPoolToken, Pool, PoolInfo, PoolShare, PoolToken, Swap as SwapModel, Token } from "../types/exchange/schema";
import {
  AddLiquidity,
  CollectProtocolFee,
  NewSwapFee,
  NewWithdrawFee,
  OwnershipTransferred,
  RemoveLiquidity,
  RemoveLiquidityImbalance,
  RemoveLiquidityOne,
  TokenSwap,
  NewAdminFee
} from "../types/exchange/templates/StableSwap/Swap";
import { Transfer } from "../types/exchange/templates/StableLP/LPToken";
import {
  createPoolShareEntity,
  ONE_BD,
  ONE_BI,
  SAVE_SWAP_FROM,
  saveTransaction,
  tokenToDecimal,
  updateStablePoolLiquidity,
  WHITELIST,
  ZERO_BD,
  ZERO_BI
} from "./helpers";
import { Bytes, ethereum } from "@graphprotocol/graph-ts/index";
import { SwapInfo, updateTokenDayData, updateVolumeStats } from "./dayUpdates";

export function handleAddLiquidity(event: AddLiquidity): void {
  let poolId = event.address.toHex();
  let pool = Pool.load(poolId);
  let poolInfo = PoolInfo.load(poolId);
  let totalSwapFee = pool.totalSwapFee;

  let tokensList: Array<Bytes> = poolInfo.tokensList;
  let tokenAmounts = event.params.tokenAmounts;
  let fees = event.params.fees;

  for (let i = 0; i < tokensList.length; i++) {
    if (tokenAmounts[i].gt(ZERO_BI)) {
      let address = tokensList[i].toHex();
      let poolTokenId = poolId.concat("-").concat(address.toString());
      let poolToken = PoolToken.load(poolTokenId);
      let tokenAmountIn = tokenToDecimal(tokenAmounts[i].toBigDecimal(), poolToken.decimals);
      poolToken.balance = poolToken.balance.plus(tokenAmountIn);
      poolToken.save();

      let feeValue = poolToken.priceUSD.times(tokenToDecimal(fees[i].toBigDecimal(), poolToken.decimals));
      totalSwapFee = totalSwapFee.plus(feeValue);

      let token = Token.load(address);
      let tokenAmountUSD = tokenAmountIn.times(token.priceUSD);
      updateTokenDayData(token!, event, tokenAmountIn, tokenAmountUSD, ZERO_BD);
    }
  }

  pool.txCount = pool.txCount.plus(ONE_BI);
  pool.totalSwapFee = totalSwapFee;

  updateStablePoolLiquidity(pool!);
  saveTransaction(event, "addLiquidity");
}

const handleRemoveLiq = (address: Address, tokenAmounts: Array<BigInt>, event: ethereum.Event): void => {
  let poolId = address.toHex();
  let pool = Pool.load(poolId);
  let poolInfo = PoolInfo.load(poolId);

  let tokensList: Array<Bytes> = poolInfo.tokensList;
  for (let i = 0; i < tokensList.length; i++) {
    if (tokenAmounts[i].gt(ZERO_BI)) {
      let address = tokensList[i].toHex();
      let poolTokenId = poolId.concat("-").concat(address.toString());
      let poolToken = PoolToken.load(poolTokenId);
      let tokenAmountOut = tokenToDecimal(tokenAmounts[i].toBigDecimal(), poolToken.decimals);
      poolToken.balance = poolToken.balance.minus(tokenAmountOut);
      poolToken.save();

      let token = Token.load(address);
      let tokenAmountUSD = tokenAmountOut.times(token.priceUSD);
      updateTokenDayData(token!, event, tokenAmountOut, tokenAmountUSD, ZERO_BD);
    }
  }

  pool.txCount = pool.txCount.plus(ONE_BI);
  updateStablePoolLiquidity(pool!);
};

export function handleRemoveLiquidity(event: RemoveLiquidity): void {
  handleRemoveLiq(event.address, event.params.tokenAmounts, event);
  saveTransaction(event, "removeLiquidity");
}

export function handleRemoveLiquidityOne(event: RemoveLiquidityOne): void {
  let poolId = event.address.toHex();
  let pool = Pool.load(poolId);
  let poolInfo = PoolInfo.load(poolId);
  let tokensList: Array<Bytes> = poolInfo.tokensList;

  let address = tokensList[event.params.boughtId.toI32()].toHex();
  let poolTokenId = poolId.concat("-").concat(address.toString());
  let poolToken = PoolToken.load(poolTokenId);
  let tokenAmountOut = tokenToDecimal(event.params.tokensBought.toBigDecimal(), poolToken.decimals);
  let newAmount = poolToken.balance.minus(tokenAmountOut);
  poolToken.balance = newAmount;
  poolToken.save();

  let token = Token.load(address);
  let tokenAmountUSD = tokenAmountOut.times(token.priceUSD);
  updateTokenDayData(token!, event, tokenAmountOut, tokenAmountUSD, ZERO_BD);
  pool.txCount = pool.txCount.plus(ONE_BI);
  updateStablePoolLiquidity(pool!);
  saveTransaction(event, "removeLiquidityOne");
}

export function handleRemoveLiquidityImbalance(event: RemoveLiquidityImbalance): void {
  handleRemoveLiq(event.address, event.params.tokenAmounts, event);
  saveTransaction(event, "removeLiquidityImbalance");
}

export function handleTokenSwap(event: TokenSwap): void {
  let poolId = event.address.toHex();
  let pool = Pool.load(poolId);
  let poolInfo = PoolInfo.load(poolId);
  let tokensList: Array<Bytes> = poolInfo.tokensList;

  let tokenInId = tokensList[event.params.soldId.toI32()].toHex();
  let tokenIn = Token.load(tokenInId);
  let poolTokenInId = poolId.concat("-").concat(tokenInId.toString());
  let poolTokenIn = PoolToken.load(poolTokenInId);
  let tokenAmountIn = tokenToDecimal(event.params.tokensSold.toBigDecimal(), poolTokenIn.decimals);
  let newAmountIn = poolTokenIn.balance.plus(tokenAmountIn);
  poolTokenIn.balance = newAmountIn;

  let tokenOutId = tokensList[event.params.boughtId.toI32()].toHex();
  let tokenOut = Token.load(tokenOutId);
  let poolTokenOutId = poolId.concat("-").concat(tokenOutId.toString());
  let poolTokenOut = PoolToken.load(poolTokenOutId);
  let tokenAmountOut = tokenToDecimal(event.params.tokensBought.toBigDecimal(), poolTokenOut.decimals);
  let newAmountOut = poolTokenOut.balance.minus(tokenAmountOut);
  poolTokenOut.balance = newAmountOut;

  let totalSwapVolume = pool.totalSwapVolume;
  let totalSwapFee = pool.totalSwapFee;
  let tokenInPrice = tokenIn.priceUSD;
  let tokenOutPrice = tokenOut.priceUSD;
  if (WHITELIST.includes(tokenIn.id) || tokenIn.isVpeg || tokenOut.priceUSD.equals(ZERO_BD)) {
    tokenOutPrice = tokenInPrice.times(tokenAmountIn.times(ONE_BD.minus(poolInfo.swapFee))).div(tokenAmountOut);
  } else if (WHITELIST.includes(tokenOut.id) || tokenOut.isVpeg) {
    tokenInPrice = tokenOutPrice.times(tokenAmountOut).div(tokenAmountIn.times(ONE_BD.minus(poolInfo.swapFee)));
  } else if (tokenInPrice.gt(ZERO_BD) && tokenIn.poolLiquidity.gt(tokenOut.poolLiquidity)) {
    tokenOutPrice = tokenInPrice.times(tokenAmountIn.times(ONE_BD.minus(poolInfo.swapFee))).div(tokenAmountOut);
  } else {
    tokenInPrice = tokenOutPrice.times(tokenAmountOut).div(tokenAmountIn.times(ONE_BD.minus(poolInfo.swapFee)));
  }

  if (
    !tokenIn.isVpeg &&
    !WHITELIST.includes(tokenIn.id) &&
    (tokenIn.priceUSD.equals(ZERO_BD) || tokenIn.poolTokenId == pool.id || poolTokenIn.reserveUSD.gt(tokenIn.poolLiquidity))
  ) {
    tokenIn.priceUSD = tokenInPrice;
    tokenIn.poolTokenId = pool.id;
    tokenIn.poolLiquidity = poolTokenIn.reserveUSD;
  }
  if (
    !tokenOut.isVpeg &&
    !WHITELIST.includes(tokenOut.id) &&
    (tokenOut.priceUSD.equals(ZERO_BD) || tokenOut.poolTokenId == pool.id || poolTokenOut.reserveUSD.gt(tokenOut.poolLiquidity))
  ) {
    tokenOut.priceUSD = tokenOutPrice;
    tokenOut.poolTokenId = pool.id;
    tokenOut.poolLiquidity = poolTokenOut.reserveUSD;
  }
  poolTokenOut.priceUSD = tokenOut.priceUSD;
  poolTokenIn.priceUSD = tokenIn.priceUSD;

  tokenIn.tradeVolume = tokenIn.tradeVolume.plus(tokenAmountIn);
  let tokenAmountInUSD = tokenAmountIn.times(tokenInPrice);
  tokenIn.tradeVolumeUSD = tokenIn.tradeVolumeUSD.plus(tokenAmountInUSD);

  tokenOut.tradeVolume = tokenOut.tradeVolume.plus(tokenAmountOut);
  let tokenAmountOutUSD = tokenAmountOut.times(tokenOutPrice);
  tokenOut.tradeVolumeUSD = tokenOut.tradeVolumeUSD.plus(tokenAmountOutUSD);

  let swapValue = tokenAmountOutUSD.plus(tokenAmountInUSD).div(BigDecimal.fromString("2"));
  let swapFeeValue = swapValue.times(poolInfo.swapFee);
  let protocolFeeValue = swapFeeValue.times(poolInfo.adminFee);

  totalSwapVolume = totalSwapVolume.plus(swapValue);
  totalSwapFee = totalSwapFee.plus(swapFeeValue);

  tokenIn.txCount = tokenIn.txCount.plus(ONE_BI);
  tokenOut.txCount = tokenOut.txCount.plus(ONE_BI);
  tokenIn.save();
  tokenOut.save();

  poolTokenIn.save();
  poolTokenOut.save();

  updateTokenDayData(tokenIn!, event, tokenAmountIn, tokenAmountInUSD, ZERO_BD);
  updateTokenDayData(tokenOut!, event, tokenAmountOut, tokenAmountOutUSD, ZERO_BD);

  pool.totalSwapVolume = totalSwapVolume;
  pool.totalSwapFee = totalSwapFee;
  pool.txCount = pool.txCount.plus(ONE_BI);

  //update pool liquidity replacement
  updateStablePoolLiquidity(pool!);
  if (SAVE_SWAP_FROM.lt(event.block.number)) {
    let swapId = event.transaction.hash
      .toHexString()
      .concat("-")
      .concat(event.logIndex.toString());
    let swap = new SwapModel(swapId);
    swap.caller = event.params.buyer;
    swap.tx = event.transaction.hash;
    swap.tokenIn = tokensList[event.params.soldId.toI32()];
    swap.tokenInSym = poolTokenIn.symbol;
    swap.tokenOut = tokensList[event.params.boughtId.toI32()];
    swap.tokensList = [tokensList[event.params.soldId.toI32()], tokensList[event.params.boughtId.toI32()]];
    swap.tokenOutSym = poolTokenOut.symbol;
    swap.tokenAmountIn = tokenAmountIn;
    swap.tokenAmountOut = tokenAmountOut;
    swap.poolAddress = event.address.toHex();
    swap.userAddress = event.transaction.from.toHex();
    swap.value = swapValue;
    swap.feeValue = swapFeeValue;
    swap.protocolFeeValue = protocolFeeValue;
    swap.timestamp = event.block.timestamp.toI32();
    swap.save();
    saveTransaction(event, "swap");
  }
  updateVolumeStats(pool!, poolInfo!, new SwapInfo(event, swapValue, swapFeeValue, protocolFeeValue));
}

export function handleCollectProtocolFee(event: CollectProtocolFee): void {
  let poolId = event.address.toHex();
  let tokenId = event.params.token.toHex();
  let poolTokenId = poolId.concat("-").concat(tokenId.toString());
  let poolToken = PoolToken.load(poolTokenId);
  if (poolToken == null) {
    return;
  }

  let collectedFundAmount = tokenToDecimal(event.params.amount.toBigDecimal(), poolToken.decimals);

  poolToken.balance = poolToken.balance.minus(collectedFundAmount);
  poolToken.save();

  let token = Token.load(tokenId);
  if (token == null) {
    return;
  }

  // let factory = getFactory();
  // let collectedFundUSD = token.priceUSD.times(collectedFundAmount);
  // factory.totalVpegProtocolFee = factory.totalVpegProtocolFee.plus(collectedFundUSD);
  // factory.save();
}

export function handleNewSwapFee(event: NewSwapFee): void {
  let poolId = event.address.toHex();

  let poolInfo = PoolInfo.load(poolId);
  poolInfo.swapFee = tokenToDecimal(event.params.newSwapFee.toBigDecimal(), 10);
  poolInfo.save();
}

export function handleNewWithdrawFee(event: NewWithdrawFee): void {
  let poolId = event.address.toHex();

  let poolInfo = PoolInfo.load(poolId);
  poolInfo.withdrawFee = tokenToDecimal(event.params.newWithdrawFee.toBigDecimal(), 10);
  poolInfo.save();
}

export function handleNewAdminFee(event: NewAdminFee): void {
  let poolId = event.address.toHex();
  let poolInfo = PoolInfo.load(poolId);
  poolInfo.adminFee = tokenToDecimal(event.params.newAdminFee.toBigDecimal(), 10);
  poolInfo.save();
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {
  let poolId = event.address.toHex();
  let poolInfo = PoolInfo.load(poolId);

  if (poolInfo != null) {
    poolInfo.timelock = event.params.newOwner;
    poolInfo.save();
  }
}

export function handleTransfer(event: Transfer): void {
  let lPPoolTokenId = event.address.toHex();
  let poolLp = LPPoolToken.load(lPPoolTokenId);
  let poolId = poolLp.poolId;

  let ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  let isMint = event.params.from.toHex() == ZERO_ADDRESS;
  let isBurn = event.params.to.toHex() == ZERO_ADDRESS;

  let poolShareFromId = poolId.concat("-").concat(event.params.from.toHex());
  let poolShareFrom = PoolShare.load(poolShareFromId);
  let poolShareFromBalance = poolShareFrom == null ? ZERO_BD : poolShareFrom.balance;

  let poolShareToId = poolId.concat("-").concat(event.params.to.toHex());
  let poolShareTo = PoolShare.load(poolShareToId);
  let poolShareToBalance = poolShareTo == null ? ZERO_BD : poolShareTo.balance;

  let pool = Pool.load(poolId);

  let poolShareAmount = tokenToDecimal(event.params.value.toBigDecimal(), poolLp.decimals);

  if (isMint) {
    if (poolShareTo == null) {
      createPoolShareEntity(poolShareToId, poolId, event.params.to.toHex());
      poolShareTo = PoolShare.load(poolShareToId);
    }
    poolShareTo.balance = poolShareTo.balance.plus(poolShareAmount);
    poolShareTo.save();
    pool.totalShares = pool.totalShares.plus(poolShareAmount);
  } else if (isBurn) {
    if (poolShareFrom == null) {
      createPoolShareEntity(poolShareFromId, poolId, event.params.from.toHex());
      poolShareFrom = PoolShare.load(poolShareFromId);
    }
    poolShareFrom.balance = poolShareFrom.balance.minus(poolShareAmount);
    if (poolShareFrom.balance.le(ZERO_BD)) {
      store.remove("PoolShare", poolShareFrom.id);
    } else {
      poolShareFrom.save();
    }
    pool.totalShares = pool.totalShares.minus(poolShareAmount);
  } else {
    if (poolShareTo == null) {
      createPoolShareEntity(poolShareToId, poolId, event.params.to.toHex());
      poolShareTo = PoolShare.load(poolShareToId);
    }
    poolShareTo.balance = poolShareTo.balance.plus(poolShareAmount);
    poolShareTo.save();

    if (poolShareFrom == null) {
      createPoolShareEntity(poolShareFromId, poolId, event.params.from.toHex());
      poolShareFrom = PoolShare.load(poolShareFromId);
    }
    poolShareFrom.balance = poolShareFrom.balance.minus(poolShareAmount);
    if (poolShareFrom.balance.le(ZERO_BD)) {
      store.remove("PoolShare", poolShareFrom.id);
    } else {
      poolShareFrom.save();
    }
  }

  if (poolShareTo !== null && poolShareTo.balance.notEqual(ZERO_BD) && poolShareToBalance.equals(ZERO_BD)) {
    pool.holdersCount = pool.holdersCount.plus(ONE_BI);
  }

  if (poolShareFrom !== null && poolShareFrom.balance.equals(ZERO_BD) && poolShareFromBalance.notEqual(ZERO_BD)) {
    pool.holdersCount = pool.holdersCount.minus(ONE_BI);
  }

  updateStablePoolLiquidity(pool!);
}
