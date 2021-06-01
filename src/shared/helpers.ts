import { BigDecimal, Address, BigInt, Bytes, dataSource, ethereum } from "@graphprotocol/graph-ts";


export let ZERO_BD = BigDecimal.fromString("0");
export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let ONE_BD = BigDecimal.fromString("1");
export let BI_18 = BigInt.fromI32(18);
let network = dataSource.network();

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
