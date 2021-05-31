import {BigDecimal, BigInt, ethereum, Address} from "@graphprotocol/graph-ts";
import {Exchange, Pool, PoolDayData, Token, TokenDayData, ExchangeDayData, PoolInfo} from "../types/exchange/schema";
import { getExchange, ONE_BI, ZERO_BD, ZERO_BI } from "./helpers";

export class SwapInfo {
  constructor(public readonly event: ethereum.Event, public readonly swapValue: BigDecimal, public swapFeeValue: BigDecimal, public totalProtocolFee: BigDecimal) {}
}

export function updateVolumeStats(pool: Pool, poolInfo: PoolInfo, swapStat: SwapInfo): void {
  let factory = getExchange(poolInfo.exchangeID);
  factory.totalSwapVolume = factory.totalSwapVolume.plus(swapStat.swapValue);
  factory.totalSwapFee = factory.totalSwapFee.plus(swapStat.swapFeeValue);
  factory.totalProtocolFee = factory.totalProtocolFee.plus(swapStat.totalProtocolFee);
  factory.save();
  updateExchangeDayData(swapStat, factory!);
  updatePoolDayData(pool, swapStat);
}

function updateExchangeDayData(swapStat: SwapInfo, factory: Exchange): void {
  let timestamp = swapStat.event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;
  let id = BigInt.fromI32(dayID).toString() + "-" + factory.id;
  let dayData = ExchangeDayData.load(id);
  if (dayData == null) {
    dayData = new ExchangeDayData(id);
    dayData.exchangeID = factory.id;
    dayData.date = dayStartTimestamp;
    dayData.dailyVolumeUSD = ZERO_BD;
    dayData.dailyFeeUSD = ZERO_BD;
    dayData.txCount = ZERO_BI;
  }
  dayData.dailyFeeUSD = dayData.dailyFeeUSD.plus(swapStat.swapFeeValue);
  dayData.dailyProtocolFeeUSD = dayData.dailyFeeUSD.plus(swapStat.totalProtocolFee);
  dayData.dailyVolumeUSD = dayData.dailyVolumeUSD.plus(swapStat.swapValue);
  dayData.totalLiquidityUSD = factory.totalLiquidity;
  dayData.totalFeeUSD = factory.totalSwapFee;
  dayData.totalVolumeUSD = factory.totalSwapVolume;
  dayData.txCount = dayData.txCount.plus(BigInt.fromI32(1));
  dayData.save();
}

export function updatePoolDayData(pool: Pool, swapStat: SwapInfo): void {
  let timestamp = swapStat.event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;
  let dayPoolID = pool.id.concat("-").concat(BigInt.fromI32(dayID).toString());
  let poolDayData = PoolDayData.load(dayPoolID);
  if (poolDayData == null) {
    poolDayData = new PoolDayData(dayPoolID);
    poolDayData.date = dayStartTimestamp;
    poolDayData.poolAddress = Address.fromString(pool.id);
    poolDayData.dailyFeeUSD = ZERO_BD;
    poolDayData.dailyVolumeUSD = ZERO_BD;
    poolDayData.dailyTxns = ZERO_BI;
  }
  poolDayData.totalShares = pool.totalShares;
  poolDayData.liquidity = pool.liquidity;
  poolDayData.dailyFeeUSD = poolDayData.dailyFeeUSD.plus(swapStat.swapFeeValue);
  poolDayData.dailyProtocolFeeUSD = poolDayData.dailyFeeUSD.plus(swapStat.totalProtocolFee);

  poolDayData.dailyVolumeUSD = poolDayData.dailyVolumeUSD.plus(swapStat.swapValue);
  poolDayData.dailyTxns = poolDayData.dailyTxns.plus(ONE_BI);
  poolDayData.save();
}

export function updateTokenDayData(
  token: Token,
  event: ethereum.Event,
  volumeToken: BigDecimal,
  volumeUSD: BigDecimal,
  totalProtocolFee: BigDecimal,
): void {
  if (token.priceUSD.equals(ZERO_BD)) return;
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;
  let dayTokenID = token.id.concat("-").concat(BigInt.fromI32(dayID).toString());
  let data = TokenDayData.load(dayTokenID);
  if (data == null) {
    data = new TokenDayData(dayTokenID);
    data.date = dayStartTimestamp;
    data.tokenId = Address.fromString(token.id);
    data.dailyVolumeToken = ZERO_BD;
    data.dailyVolumeUSD = ZERO_BD;
    data.totalProtocolFee = ZERO_BD;
    data.totalLiquidityToken = ZERO_BD;
    data.dailyTxns = ZERO_BI;
  }
  data.priceUSD = token.priceUSD;
  data.totalLiquidityUSD = token.totalLiquidity;
  data.dailyVolumeUSD = data.dailyVolumeUSD.plus(volumeUSD);
  data.dailyVolumeToken = data.dailyVolumeToken.plus(volumeToken);
  data.totalProtocolFee = data.totalProtocolFee.plus(totalProtocolFee);
  data.dailyTxns = data.dailyTxns.plus(ONE_BI);
  data.save();
}