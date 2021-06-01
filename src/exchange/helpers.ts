import { BigDecimal, Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Pool, User, PoolToken, PoolShare, Token, Exchange, PoolInfo } from "../types/exchange/schema";
import { BToken } from "../types/exchange/FactoryV2/BToken";
import { BTokenBytes } from "../types/exchange/FactoryV2/BTokenBytes";

export let ZERO_BD = BigDecimal.fromString("0");
export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let ONE_BD = BigDecimal.fromString("1");
export let MIN_LIQUIDITY_BD = BigDecimal.fromString("200");
export let MIN_RESERVE_UPDATE_BD = BigDecimal.fromString("10");

export let HOPE: string = "0x4f0ed527e8a95ecaa132af214dfd41f30b361600";
export let USD: string = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"; // USDC
export let USDT: string = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"; // USDT
export let DAI: string = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"; // DAI
export let MATIC: string = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
export let STABLES: string[] = [DAI, USD, USDT];
export let WHITELIST: string[] = [HOPE, MATIC, DAI, USD, USDT];
export let SAVE_SWAP_FROM = BigInt.fromI32(0);
export function getExchange(id: string): Exchange | null {
  let factory = Exchange.load(id);
  if (factory === null) {
    factory = new Exchange(id);
    factory.poolCount = 0;
    factory.txCount = BigInt.fromI32(0);
    factory.totalLiquidity = ZERO_BD;
    factory.protocolFee = ZERO_BD;
    factory.totalSwapVolume = ZERO_BD;
    factory.totalSwapFee = ZERO_BD;
    factory.totalProtocolFee = ZERO_BD;
    factory.save()
  }
  return factory;
}

export function isUpdateReserve(before: BigDecimal, after: BigDecimal): boolean {
  if (after.gt(before)) {
    return after.minus(before).gt(MIN_RESERVE_UPDATE_BD);
  }
  return before.minus(after).gt(MIN_RESERVE_UPDATE_BD);
}
export function hexToDecimal(hexString: string, decimals: i32): BigDecimal {
  let bytes = Bytes.fromHexString(hexString).reverse() as Bytes;
  let bi = BigInt.fromUnsignedBytes(bytes);
  let scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal();
  return bi.divDecimal(scale);
}

export function bigIntToDecimal(amount: BigInt, decimals: i32): BigDecimal {
  let scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal();
  return amount.toBigDecimal().div(scale);
}

export function maxBigDecimal(o1: BigDecimal, o2: BigDecimal): BigDecimal {
  return o1.gt(o2) ? o1 : o2;
}

export function maxBigInt(o1: BigInt, o2: BigInt): BigInt {
  return o1.gt(o2) ? o1 : o2;
}

export function minBigDecimal(o1: BigDecimal, o2: BigDecimal): BigDecimal {
  return o1.lt(o2) ? o1 : o2;
}

export function minBigInt(o1: BigInt, o2: BigInt): BigInt {
  return o1.lt(o2) ? o1 : o2;
}

export function tokenToDecimal(amount: BigDecimal, decimals: i32): BigDecimal {
  let scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal();
  return amount.div(scale);
}

export function createPoolShareEntity(id: string, pool: string, user: string): void {
  let poolShare = new PoolShare(id);

  createUserEntity(user);

  poolShare.userAddress = user;
  poolShare.poolId = pool;
  poolShare.balance = ZERO_BD;
  poolShare.save();
}

export function getTokenPriority(token: string): number {
  return WHITELIST.indexOf(token);
}

export function getTrackedVolumeUSD(tokenAmount0: BigDecimal, token0: Token, tokenAmount1: BigDecimal, token1: Token): BigDecimal {
  let token0Priority = getTokenPriority(token0.id);
  let token1Priority = getTokenPriority(token1.id);

  if (token0Priority > token1Priority || (token1Priority == token0Priority && token0.poolLiquidity > token1.poolLiquidity)) {
    return token0.priceUSD.times(tokenAmount0);
  } else if (token1Priority > token0Priority || (token1Priority == token0Priority && token1.poolLiquidity > token0.poolLiquidity)) {
    return token1.priceUSD.times(tokenAmount1);
  } else {
    return token0.priceUSD
      .times(tokenAmount0)
      .plus(token1.priceUSD.times(tokenAmount1))
      .div(BigDecimal.fromString("2"));
  }
}

export function createPoolTokenEntity(id: string, pool: string, address: string): PoolToken {
  let token = createTokenEntity(address);
  let poolToken = new PoolToken(id);
  poolToken.poolId = pool;
  poolToken.address = address;
  poolToken.name = token.name;
  poolToken.symbol = token.symbol;
  poolToken.decimals = token.decimals;
  poolToken.priceUSD = token.priceUSD;
  poolToken.balance = ZERO_BD;
  poolToken.denormWeight = ZERO_BD;
  poolToken.reserveUSD = ZERO_BD;
  poolToken.save();
  return poolToken;
}

export function createTokenEntity(address: string): Token | null {
  let token = Token.load(address);
  if (token == null) {
    token = new Token(address);
    let tokenContract = BToken.bind(Address.fromString(address));
    let tokenBytes = BTokenBytes.bind(Address.fromString(address));
    let symbol = "";
    let name = "";
    let decimals = 18;
    let symbolCall = tokenContract.try_symbol();
    let nameCall = tokenContract.try_name();
    let decimalCall = tokenContract.try_decimals();

    if (symbolCall.reverted) {
      let symbolBytesCall = tokenBytes.try_symbol();
      if (!symbolBytesCall.reverted) {
        symbol = symbolBytesCall.value.toString();
      }
    } else {
      symbol = symbolCall.value;
    }

    if (nameCall.reverted) {
      let nameBytesCall = tokenBytes.try_name();
      if (!nameBytesCall.reverted) {
        name = nameBytesCall.value.toString();
      }
    } else {
      name = nameCall.value;
    }

    if (!decimalCall.reverted) {
      decimals = decimalCall.value;
    }

    token.name = name;
    token.symbol = symbol;
    token.decimals = decimals;
    token.poolTokenId = "";
    token.priceUSD = address == USD || address == DAI || address == USDT ? ONE_BD : ZERO_BD;
    token.poolLiquidity = ZERO_BD;
    token.totalLiquidity = ZERO_BD;
    token.tradeVolume = ZERO_BD;
    token.totalProtocolFee = ZERO_BD;
    token.tradeVolumeUSD = ZERO_BD;
    token.txCount = ZERO_BI;
    token.isVpeg = false;
    token.save();
  }
  return token;
}

export function updateStablePoolLiquidity(pool: Pool): void {
  if (pool == null) {
    throw new Error("Pool must be not null");
  }
  let poolInfo = PoolInfo.load(pool.id);
  let tokensList: Array<Bytes> = poolInfo.tokensList;
  let liquidity = ZERO_BD;
  let id = pool.id;
  for (let i = 0; i < tokensList.length; i++) {
    let tokenId = tokensList[i].toHexString();
    let token = Token.load(tokenId);
    let poolTokenId = id.concat("-").concat(tokenId);
    let poolToken = PoolToken.load(poolTokenId);
    let reserveUsd = poolToken.balance.times(token.priceUSD);
    if (isUpdateReserve(poolToken.reserveUSD, reserveUsd)) {
      token.totalLiquidity = token.totalLiquidity.minus(poolToken.reserveUSD).plus(reserveUsd);
      poolToken.reserveUSD = reserveUsd;
      poolToken.save();
      token.save();
    }
    if (poolToken.balance.equals(ZERO_BD) || token.priceUSD.equals(ZERO_BD)) {
      liquidity = ZERO_BD;
      break;
    }
    liquidity = liquidity.plus(token.priceUSD.times(poolToken.balance));
  }
  let factory = getExchange(poolInfo.exchangeID);
  factory.totalLiquidity = factory.totalLiquidity.minus(pool.liquidity).plus(liquidity);
  factory.txCount = factory.txCount.plus(ONE_BI);
  factory.save();
  if (liquidity.gt(ZERO_BD) && pool.totalShares.gt(ZERO_BD)) {
    let token = Token.load(poolInfo.lpAddress);
    token.totalLiquidity = liquidity;
    token.poolLiquidity = liquidity;
    token.priceUSD = liquidity.div(pool.totalShares);
    token.save();
    pool.liquidity = liquidity;
  }
  pool.save();
}

export function updatePoolLiquidity(pool: Pool): void {
  if (pool == null) {
    throw new Error("Pool must be not null");
  }
  let id = pool.id;
  let poolInfo = PoolInfo.load(id);
  let tokensList: Array<Bytes> = poolInfo.tokensList;
  // Find pool liquidity

  let hasPrice = false;
  let hasUsdPrice = false;
  let poolLiquidity = ZERO_BD;

  if (tokensList.includes(Address.fromString(USD))) {
    let usdPoolTokenId = id.concat("-").concat(USD);
    let usdPoolToken = PoolToken.load(usdPoolTokenId);
    poolLiquidity = usdPoolToken.balance.div(usdPoolToken.denormWeight).times(poolInfo.totalWeight);
    hasPrice = true;
    hasUsdPrice = true;
  } else if (tokensList.includes(Address.fromString(DAI))) {
    let usdPoolTokenId = id.concat("-").concat(DAI);
    let usdPoolToken = PoolToken.load(usdPoolTokenId);
    poolLiquidity = usdPoolToken.balance.div(usdPoolToken.denormWeight).times(poolInfo.totalWeight);
    hasPrice = true;
    hasUsdPrice = true;
  } else if (tokensList.includes(Address.fromString(USDT))) {
    let usdPoolTokenId = id.concat("-").concat(USDT);
    let usdPoolToken = PoolToken.load(usdPoolTokenId);
    poolLiquidity = usdPoolToken.balance.div(usdPoolToken.denormWeight).times(poolInfo.totalWeight);
    hasPrice = true;
    hasUsdPrice = true;
  } else if (tokensList.includes(Address.fromString(HOPE))) {
    let hopeToken = Token.load(HOPE);
    if (hopeToken !== null && hopeToken.priceUSD.gt(ZERO_BD)) {
      let poolTokenId = id.concat("-").concat(HOPE);
      let poolToken = PoolToken.load(poolTokenId);
      poolLiquidity = hopeToken.priceUSD
        .times(poolToken.balance)
        .div(poolToken.denormWeight)
        .times(poolInfo.totalWeight);
      hasPrice = true;
    }
  } else if (tokensList.includes(Address.fromString(MATIC))) {
    let maticToken = Token.load(MATIC);
    if (maticToken !== null && maticToken.priceUSD.gt(ZERO_BD)) {
      let poolTokenId = id.concat("-").concat(MATIC);
      let poolToken = PoolToken.load(poolTokenId);
      poolLiquidity = maticToken.priceUSD
        .times(poolToken.balance)
        .div(poolToken.denormWeight)
        .times(poolInfo.totalWeight);
      hasPrice = true;
    }
  }

  // Create or update token price
  let liquidity = poolLiquidity;
  let denormWeight = ZERO_BD;

  let poolTokens: Array<PoolToken> = [];
  let isPoolNativeStable = tokensList.includes(Address.fromString(MATIC)) && tokensList.includes(Address.fromString(USDT)); //only update MATIC by pool MATIC-USDT
  let tokens: Array<Token> = [];
  for (let i: i32 = 0; i < tokensList.length; i++) {
    let tokenId = tokensList[i].toHexString();
    let token = Token.load(tokenId);
    let poolTokenId = id.concat("-").concat(tokenId);
    let poolToken = PoolToken.load(poolTokenId);
    if (hasPrice) {
      if (
        (token.poolTokenId == poolTokenId || poolLiquidity.gt(token.poolLiquidity)) &&
        (tokenId != HOPE.toString() || (poolInfo.tokensCount.equals(BigInt.fromI32(2)) && hasUsdPrice))
      ) {
        if (((isPoolNativeStable && tokenId == MATIC.toString()) || tokenId != MATIC.toString()) && poolLiquidity.gt(MIN_LIQUIDITY_BD)) {
          if (poolToken.balance.gt(ZERO_BD) && !STABLES.includes(tokenId)) {
            token.priceUSD = poolLiquidity
              .div(poolInfo.totalWeight)
              .times(poolToken.denormWeight)
              .div(poolToken.balance);
          }
          token.poolLiquidity = poolLiquidity;
          token.poolTokenId = poolTokenId;
        }
      }
    } else if (poolToken.denormWeight.gt(denormWeight) && token.priceUSD.gt(ZERO_BD)) {
      denormWeight = poolToken.denormWeight;
      liquidity = token.priceUSD
        .times(poolToken.balance)
        .div(poolToken.denormWeight)
        .times(poolInfo.totalWeight);
    }
    poolTokens.push(poolToken!);
    tokens.push(token!);
  }
  if (liquidity.gt(MIN_LIQUIDITY_BD)) {
    for (let i = 0; i < poolTokens.length; i++) {
      let poolToken = poolTokens[i];
      let token = tokens[i];
      let reserveUsd = liquidity.div(poolInfo.totalWeight).times(poolToken.denormWeight);
      token.totalLiquidity = token.totalLiquidity.minus(poolToken.reserveUSD).plus(reserveUsd);
      poolToken.reserveUSD = reserveUsd;
      if (poolToken.balance.gt(ZERO_BD)) {
        poolToken.priceUSD = reserveUsd.div(poolToken.balance);
        if (token.priceUSD.equals(ZERO_BD) || token.poolLiquidity.equals(ZERO_BD) || token.poolTokenId == poolToken.id) {
          token.priceUSD = poolToken.priceUSD;
          token.poolLiquidity = poolLiquidity.equals(ZERO_BD) ? ZERO_BD : reserveUsd;
          token.poolTokenId = poolToken.id;
        }
      }
      token.save();
      poolToken.save();
    }
  }
  let factory = getExchange(poolInfo.exchangeID);
  factory.totalLiquidity = factory.totalLiquidity.minus(pool.liquidity).plus(liquidity);
  factory.txCount = factory.txCount.plus(ONE_BI);
  factory.save();
  pool.liquidity = liquidity;
  pool.save();
}

export function saveTransaction(event: ethereum.Event, eventName: string): void {
  let userAddress = event.transaction.from.toHex();
  createUserEntity(userAddress);
}

export function createUserEntity(address: string): void {
  if (User.load(address) == null) {
    let user = new User(address);
    user.save();
  }
}
