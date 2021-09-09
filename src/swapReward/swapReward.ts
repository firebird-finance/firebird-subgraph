import {SwapReward, WithdrawReward} from "../types/swapReward/schema";
import {Rewarded, Withdraw} from "../types/swapReward/SwapReward/SwapReward";

export function handleRewarded(event: Rewarded): void {
  let id = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let swapReward = new SwapReward(id);
  swapReward.userAddress = event.params.account;
  swapReward.inputToken = event.params.input;
  swapReward.outputToken = event.params.output;
  swapReward.outputAmount = event.params.amount.toBigDecimal();
  swapReward.rewardAmount = event.params.quantity.toBigDecimal();
  swapReward.tx = event.transaction.hash;
  swapReward.blockNumber = event.block.number;
  swapReward.time = event.block.timestamp;
  swapReward.save();
}

export function handleWithdraw(event: Withdraw): void {
  let id = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let withdrawReward = new WithdrawReward(id);
  withdrawReward.userAddress = event.params.userAddress;
  withdrawReward.rewardAmount = event.params.amount.toBigDecimal();
  withdrawReward.tx = event.transaction.hash;
  withdrawReward.blockNumber = event.block.number;
  withdrawReward.time = event.block.timestamp;
  withdrawReward.save();
}
