import { BigDecimal, Address, BigInt, Bytes, dataSource, ethereum } from "@graphprotocol/graph-ts";
import {
  Token,
  StakeMovement, Controller
} from "../types/stakePool/schema";
import { BToken } from "../types/stakePool/StakePoolController/BToken";
import { BTokenBytes } from "../types/stakePool/StakePoolController/BTokenBytes";

export function getController(): Controller | null {
  return Controller.load("1");
}


export function createStakeMovementEntity(
  txnHash: Bytes,
  logIndex: string,
  poolId: string,
  user: Bytes,
  type: i32,
  amount: BigDecimal,
  stakingPoolId: string = null
): void {
  let stakeMovement = new StakeMovement(
    txnHash
      .toHex()
      .concat("-")
      .concat(logIndex)
  );
  stakeMovement.stakeToken = poolId;
  stakeMovement.stakingPoolId = stakingPoolId;
  stakeMovement.userAddress = user;
  stakeMovement.tx = txnHash;
  stakeMovement.amount = amount;
  stakeMovement.type = type;
  stakeMovement.save();
}


export function createTokenEntity(address: string): Token | null {
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

  let token = Token.load(address);
  if (token == null) {
    token = new Token(address);
    token.name = name;
    token.symbol = symbol;
    token.decimals = decimals;
    token.save();
  }
  return token;
}
