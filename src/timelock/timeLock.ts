import { log, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  CancelTransaction,
  ExecuteTransaction,
  NewAdmin,
  NewDelay,
  NewPendingAdmin,
  QueueTransaction
} from "../types/timelock/templates/Timelock/Timelock";
import { Timelock, Spell } from "../types/timelock/schema";
import { TimeLock as TimeLockSmartContract } from "../types/timelock/StakePoolController/TimeLock";

export function handleCancelTransaction(event: CancelTransaction): void {
  let id = event.params.txHash.toHexString(); // Signature of the transaction - not a transaction hash!
  let tx = Spell.load(id);
  if (tx === null) {
    log.error("Compound Timelock handleCancelTransaction. Spell id not found: {}", [id]);
    return;
  }
  tx.isCancelled = true;
  tx.cancelledAtTimestamp = event.block.timestamp;
  tx.cancelledAtTransaction = event.transaction.hash.toHexString();
  tx.save();
}

export function handleExecuteTransaction(event: ExecuteTransaction): void {
  let id = event.params.txHash.toHexString(); // Signature of the transaction - not a transaction hash!
  let tx = Spell.load(id);
  if (tx === null) {
    log.error("Compound Timelock handleExecuteTransaction. Spell id not found: {}", [id]);
    return;
  }
  tx.isExecuted = true;
  tx.executedAtTimestamp = event.block.timestamp;
  tx.executedAtTransaction = event.transaction.hash.toHexString();
  tx.save();
}

export function handleNewAdmin(event: NewAdmin): void {
  let id = event.address.toHexString();
  let timelock = Timelock.load(id);
  if (timelock === null) {
    log.error("Compound Timelock handleExecuteTransaction. Timelock id not found: {}", [id]);
    return;
  }
  timelock.currentAdmin = event.params.newAdmin;
  timelock.newPendingAdmin = null;
  timelock.save();
}

export function handleNewDelay(event: NewDelay): void {
  let id = event.address.toHexString();
  let timelock = Timelock.load(id);
  if (timelock === null) {
    log.error("Compound Timelock handleExecuteTransaction. Timelock id not found: {}", [id]);
    return;
  }
  timelock.delay = event.params.newDelay;
  timelock.save();
}

export function handleNewPendingAdmin(event: NewPendingAdmin): void {
  let id = event.address.toHexString();
  let timelock = Timelock.load(id);
  if (timelock === null) {
    log.error("Compound Timelock handleExecuteTransaction. Timelock id not found: {}", [id]);
    return;
  }
  timelock.newPendingAdmin = event.params.newPendingAdmin;
  timelock.save();
}

export function handleQueueTransaction(event: QueueTransaction): void {
  let id = event.params.txHash.toHexString(); // Signature of the spell (not the transaction hash!)
  let tx = Spell.load(id);
  if (tx === null) {
    let timelockAddress = event.address;
    tx = new Spell(id);
    tx.eta = event.params.eta;
    tx.createdAtTimestamp = event.block.timestamp;
    tx.createdAtTransaction = event.transaction.hash.toHexString();
    tx.expiresAtTimestamp = tx.eta.plus(convertDaysToSeconds(BigInt.fromI32(14))); // Compound uses a hard-coded 14-day expiry period
    tx.value = event.params.value;
    tx.functionName = event.params.signature;
    tx.signature = event.params.signature;
    tx.data = event.params.data.toHexString();
    tx.target = event.params.target;
    tx.timelock = timelockAddress.toHexString();
    tx.isCancelled = false;
    tx.isExecuted = false;
    tx.save();
  }
}

export function createTimelock(address: Address, root: Address, admin: Bytes = null): void {
  let timelock = Timelock.load(address.toHexString());
  if (timelock === null) {
    let timeLock = new Timelock(address.toHexString());
    let timeLockContract = TimeLockSmartContract.bind(address);
    if (!admin) {
      let adminCall = timeLockContract.try_admin();
      let currentAdmin: Bytes;
      if (!adminCall.reverted) {
        currentAdmin = adminCall.value;
      }
      timeLock.currentAdmin = currentAdmin;
    } else {
      timeLock.currentAdmin = admin;
    }
    let graceCall = timeLockContract.try_GRACE_PERIOD();
    let gracePeriod: BigInt;
    if (!graceCall.reverted) {
      gracePeriod = graceCall.value;
    }
    timeLock.gracePeriod = gracePeriod;
    timeLock.root = root;
    timeLock.save();
  }
}

const convertDaysToSeconds = (days: BigInt): BigInt => {
  return days.times(BigInt.fromI32(86400));
};
