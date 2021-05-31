import { BigDecimal, Address, BigInt, Bytes, dataSource, ethereum } from "@graphprotocol/graph-ts";


export let ZERO_BD = BigDecimal.fromString("0");
export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let ONE_BD = BigDecimal.fromString("1");
export let BI_18 = BigInt.fromI32(18);
let network = dataSource.network();

export let WETH: string = "0x2170ed0880ac9a755fd29b2688956bd959f933f8";
export let VALUE: string = "0x4f0ed527e8a95ecaa132af214dfd41f30b361600";
export let USD: string = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"; // USDC
export let USDT: string = "0x55d398326f99059ff775485246999027b3197955"; // USDT
export let DAI: string = "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3"; // DAI
export let WBNB: string = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
export let BUSD: string = "0xe9e7cea3dedca5984780bafc599bd69add087d56"; // BUSD


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
