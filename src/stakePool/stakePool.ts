/* eslint-disable prefer-const */
import { BigDecimal, store } from "@graphprotocol/graph-ts";
import { RewardInfo, PaidReward, StakingPool, StakePoolShare, Token } from "../types/stakePool/schema";
import {
  AddRewardPool,
  StakePool,
  UpdateRewardPool,
  UpdateRewardRebaser,
  UpdateRewardMultiplier,
  Deposit,
  Withdraw,
  PayRewardPool
} from "../types/stakePool/templates/StakePool/StakePool";
import {
  createStakeMovementEntity,
  createTokenEntity
} from "./helpers";
import { getFactoryConfig } from "../config/syncConfig";
import { tokenToDecimal, ZERO_BD } from "../shared/helpers";

export function handleAddRewardPool(event: AddRewardPool): void {
  let rewardInfo = new RewardInfo(event.address.toHexString() + event.params.poolId.toString());
  rewardInfo.stakingPoolId = event.address.toHexString();

  let stakePool = StakePool.bind(event.address);
  let rewardInfoCall = stakePool.try_rewardPoolInfo(event.params.poolId);
  if (!rewardInfoCall.reverted) {
    let rewardTokenAddress = rewardInfoCall.value.value0.toHexString();
    let rewardToken = Token.load(rewardTokenAddress);
    if (rewardToken == null) {
      rewardToken = createTokenEntity(rewardTokenAddress);
    }
    rewardInfo.rewardToken = rewardTokenAddress;
    rewardInfo.rewardRebaserId = rewardInfoCall.value.value1.toHexString();
    rewardInfo.rewardMultiplierId = rewardInfoCall.value.value2.toHexString();
    rewardInfo.startRewardBlock = rewardInfoCall.value.value3.toBigDecimal();
    rewardInfo.lastRewardBlock = rewardInfoCall.value.value4.toBigDecimal();
    rewardInfo.endRewardBlock = rewardInfoCall.value.value5.toBigDecimal();
    rewardInfo.rewardPerBlock = tokenToDecimal(rewardInfoCall.value.value6.toBigDecimal(), rewardToken.decimals);
    rewardInfo.accRewardPerShare = tokenToDecimal(rewardInfoCall.value.value7.toBigDecimal(), rewardToken.decimals);
    rewardInfo.lockRewardPercent = rewardInfoCall.value.value8.toBigDecimal();
    rewardInfo.startVestingBlock = rewardInfoCall.value.value9.toBigDecimal();
    rewardInfo.endVestingBlock = rewardInfoCall.value.value10.toBigDecimal();
    rewardInfo.numOfVestingBlocks = rewardInfoCall.value.value11.toBigDecimal();
    rewardInfo.totalPaidRewards = tokenToDecimal(rewardInfoCall.value.value12.toBigDecimal(), rewardToken.decimals);
  }
  rewardInfo.save();
}

export function handleUpdateRewardPool(event: UpdateRewardPool): void {
  let rewardInfo = RewardInfo.load(event.address.toHexString() + event.params.poolId.toString());
  rewardInfo.endRewardBlock = event.params.endRewardBlock.toBigDecimal();
  let rewardToken = Token.load(rewardInfo.rewardToken);
  if (rewardToken == null) {
    rewardToken = createTokenEntity(rewardInfo.rewardToken);
  }
  rewardInfo.rewardPerBlock = tokenToDecimal(event.params.rewardPerBlock.toBigDecimal(), rewardToken.decimals);
  rewardInfo.save();
}

export function handleUpdateRewardRebaser(event: UpdateRewardRebaser): void {
  let rewardInfo = RewardInfo.load(event.address.toHexString() + event.params.poolId.toString());
  rewardInfo.rewardRebaserId = event.params.rewardRebaser.toHexString();
  rewardInfo.save();
}

export function handleUpdateRewardMultiplier(event: UpdateRewardMultiplier): void {
  let rewardInfo = RewardInfo.load(event.address.toHexString() + event.params.poolId.toString());
  rewardInfo.rewardMultiplierId = event.params.rewardMultiplier.toHexString();
  rewardInfo.save();
}

export function handleDeposit(event: Deposit): void {
  let stakingPoolId = event.address.toHex();
  let stakingPool = StakingPool.load(stakingPoolId);
  let stakeToken = stakingPool.stakeToken;

  let token = Token.load(stakeToken);
  if (token == null) {
    token = createTokenEntity(stakeToken);
  }

  let account = event.params.account.toHex();
  let poolShareId = stakeToken.concat("-").concat(account);

  let stakePoolShareId = poolShareId.concat(stakingPoolId);
  let stakePoolShare = StakePoolShare.load(stakePoolShareId);
  if (stakePoolShare == null) {
    stakePoolShare = new StakePoolShare(stakePoolShareId);
    stakePoolShare.userAddress = event.params.account;
    stakePoolShare.stakingPoolId = stakingPoolId;
    stakePoolShare.stakeBalance = ZERO_BD;
  }

  let amount = tokenToDecimal(event.params.amount.toBigDecimal(), token.decimals);
  // poolShare.stakeBalance = poolShare.stakeBalance.plus(amount);
  stakePoolShare.stakeBalance = stakePoolShare.stakeBalance.plus(amount);
  stakingPool.totalStakedShare = stakingPool.totalStakedShare.plus(amount);
  stakePoolShare.save();
  stakingPool.save();
  if (getFactoryConfig(stakingPool.type).syncSwapTraceFromBlock < event.block.number.toI32()) {
    createStakeMovementEntity(event.transaction.hash, event.logIndex.toString(), stakeToken, event.params.account, 0, amount, stakingPoolId);
  }
}

export function handleWithdraw(event: Withdraw): void {
  let stakingPoolId = event.address.toHex();
  let stakingPool = StakingPool.load(stakingPoolId);
  let stakeToken = stakingPool.stakeToken;

  let token = Token.load(stakeToken);
  if (token == null) {
    token = createTokenEntity(stakeToken);
  }

  let account = event.params.account.toHex();
  let poolShareId = stakeToken.concat("-").concat(account);

  let stakePoolShareId = poolShareId.concat(stakingPoolId);
  let stakePoolShare = StakePoolShare.load(stakePoolShareId);
  if (stakePoolShare == null) {
    stakePoolShare = new StakePoolShare(stakePoolShareId);
    stakePoolShare.userAddress = event.params.account;
    stakePoolShare.stakingPoolId = stakingPoolId;
    stakePoolShare.stakeBalance = ZERO_BD;
  }

  let amount = tokenToDecimal(event.params.amount.toBigDecimal(), token.decimals);
  stakePoolShare.stakeBalance = stakePoolShare.stakeBalance.minus(amount);
  if (stakePoolShare.stakeBalance.le(ZERO_BD)) {
    store.remove("StakePoolShare", stakePoolShare.id);
  } else {
    stakePoolShare.save();
  }
  stakingPool.totalStakedShare = stakingPool.totalStakedShare.minus(amount);
  stakingPool.save();
  if (getFactoryConfig(stakingPool.type).syncSwapTraceFromBlock < event.block.number.toI32()) {
    createStakeMovementEntity(event.transaction.hash, event.logIndex.toString(), stakeToken, event.params.account, 1, amount, stakingPoolId);
  }
}

export function handlePayRewardPool(event: PayRewardPool): void {
  let paidId = event.address.toHexString() + event.params.poolId.toString() + event.params.account.toHexString();
  let paidReward = PaidReward.load(paidId);
  if (paidReward == null) {
    paidReward = new PaidReward(paidId);
    paidReward.totalPaidReward = BigDecimal.fromString("0");
    paidReward.totalPaidAmount = BigDecimal.fromString("0");
  }

  paidReward.userAddress = event.params.account;
  paidReward.stakingPoolId = event.address.toHexString();
  let rewardInfo = RewardInfo.load(event.address.toHexString() + event.params.poolId.toString());
  let rewardToken = Token.load(rewardInfo.rewardToken);
  paidReward.totalPaidReward = paidReward.totalPaidReward.plus(tokenToDecimal(event.params.pendingReward.toBigDecimal(), rewardToken.decimals));
  paidReward.totalPaidAmount = paidReward.totalPaidAmount.plus(tokenToDecimal(event.params.paidReward.toBigDecimal(), rewardToken.decimals));
  paidReward.save();
}
