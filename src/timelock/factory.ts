/* eslint-disable prefer-const */
import { MasterCreated } from "../types/timelock/StakePoolController/StakePoolController";
import { Timelock as TimelockContract } from "../types/timelock/templates";
import { SwapCreated } from "../types/timelock/StableFactory/SwapFactory";

import { createTimelock } from "./timeLock";
import { Swap as SwapSmartContract } from "../types/timelock/StableFactory/Swap";

export function handleMasterCreated(event: MasterCreated): void {
  //save time lock
  createTimelock(event.params.timelock, event.params.farm, event.transaction.from);

  TimelockContract.create(event.params.timelock);
}

export function handleNewStableSwap(event: SwapCreated): void {
  let poolContract = SwapSmartContract.bind(event.params.swap);

  let ownerCall = poolContract.try_owner();
  if (!ownerCall.reverted) {
    //save time lock
    createTimelock(ownerCall.value, event.params.swap, event.transaction.from);
    TimelockContract.create(ownerCall.value);
  }
}
