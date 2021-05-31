/* eslint-disable prefer-const */
import { store, Address } from "@graphprotocol/graph-ts";
import {
  Controller,
  StakingPool,
  StakingFor,
  RewardRebaser,
  RewardMultiplier,
  Token
} from "../types/stakePool/schema";
import {
  MasterCreated,
  StakePoolController,
  SetWhitelistStakingFor,
  SetWhitelistRewardRebaser,
  SetWhitelistRewardMultiplier,
  ChangeGovernance,
  SetWhitelistStakePool
} from "../types/stakePool/StakePoolController/StakePoolController";
import { StakePool as StakePoolContract } from "../types/stakePool/templates";
import { StakePool as StakePoolSmartContract } from "../types/stakePool/StakePoolController/StakePool";
import { createTokenEntity, getController } from "./helpers";
import { ZERO_BD } from "../shared/helpers";


export function handleMasterCreated(event: MasterCreated): void {
  // load controller (create if first exchange)
  let controller = getController();
  if (controller === null) {
    controller = createController(event.address);
  }
  controller.stakingPoolCount = controller.stakingPoolCount + 1;
  controller.save();

  // save staking pool
  let stakingPool = new StakingPool(event.params.farm.toHexString());
  let stakePoolContract = StakePoolSmartContract.bind(event.params.farm);
  let stakeTokenCall = stakePoolContract.try_stakeToken();
  if (!stakeTokenCall.reverted) {
    let stakeToken = stakeTokenCall.value.toHex();
    if (Token.load(stakeToken) == null) {
      createTokenEntity(stakeToken);
    }
    stakingPool.stakeToken = stakeToken;
  }
  stakingPool.version = event.params.version.toI32();
  stakingPool.faaSRewardFund = event.params.stakePoolRewardFund;
  stakingPool.timelockId = event.params.timelock;
  stakingPool.controllerAddress = event.address;
  stakingPool.controllerId = controller.id;
  stakingPool.type = controller.type;
  stakingPool.totalStakedShare = ZERO_BD;
  stakingPool.creatorAddress = event.transaction.from;
  stakingPool.save();
  StakePoolContract.create(event.params.farm);
}

export function handleSetWhitelistStakingFor(event: SetWhitelistStakingFor): void {
  let stakingFor = StakingFor.load(event.params.contractAddress.toHexString());
  if (event.params.value) {
    if (stakingFor == null) {
      stakingFor = new StakingFor(event.params.contractAddress.toHexString());
    }
    stakingFor.controllerId = "1";
    stakingFor.controllerAddress = event.address;
    stakingFor.save();
  } else {
    if (stakingFor != null) {
      store.remove("StakingFor", stakingFor.id);
    }
  }
}

export function handleSetWhitelistRewardRebaser(event: SetWhitelistRewardRebaser): void {
  let rewardRebaser = RewardRebaser.load(event.params.contractAddress.toHexString());
  if (event.params.value) {
    if (rewardRebaser == null) {
      rewardRebaser = new RewardRebaser(event.params.contractAddress.toHexString());
    }
    rewardRebaser.controllerId = "1";
    rewardRebaser.controllerAddress = event.address;
    rewardRebaser.save();
  } else {
    if (rewardRebaser != null) {
      store.remove("RewardRebaser", rewardRebaser.id);
    }
  }
}

export function handleSetWhitelistRewardMultiplier(event: SetWhitelistRewardMultiplier): void {
  let rewardMultiplier = RewardMultiplier.load(event.params.contractAddress.toHexString());
  if (event.params.value) {
    if (rewardMultiplier == null) {
      rewardMultiplier = new RewardMultiplier(event.params.contractAddress.toHexString());
    }
    rewardMultiplier.controllerId = "1";
    rewardMultiplier.controllerAddress = event.address;
    rewardMultiplier.save();
  } else {
    if (rewardMultiplier != null) {
      store.remove("RewardMultiplier", rewardMultiplier.id);
    }
  }
}

export function handleSetWhitelistStakePool(event: SetWhitelistStakePool): void {
  let stakingPool = StakingPool.load(event.params.contractAddress.toHexString());
  if (stakingPool != null) {
    stakingPool.whitelistState = event.params.value;
    stakingPool.save();
  }
}

export function handleChangeGovernance(event: ChangeGovernance): void {
  let controller = getController();
  if (controller === null) {
    controller = createController(event.address);
  } else {
    controller.governance = event.params.governance;
  }
  controller.save();
}

function createController(address: Address): Controller {
  let controller = new Controller("1");
  controller.address = address;
  controller.type = "faas";
  controller.stakingPoolCount = 0;

  let faasController = StakePoolController.bind(address);
  let governanceCall = faasController.try_governance();
  let governance: Address;
  if (!governanceCall.reverted) {
    governance = governanceCall.value;
  }
  controller.governance = governance;
  return controller;
}
