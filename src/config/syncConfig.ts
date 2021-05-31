class SyncConfig {
  syncSwapTraceFromBlock: number;
}

export function getFactoryConfig(type: string): SyncConfig {
  if (type == "faas") {
    return {
      syncSwapTraceFromBlock: 6206666
    };
  } else {
    return {
      syncSwapTraceFromBlock: 2000000000
    };
  }
}
