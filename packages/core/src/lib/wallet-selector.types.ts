import type { Wallet, WalletModuleFactory } from "./wallet/wallet.types";
import type { ReadOnlyStore } from "./store.types";
import type { Network, NetworkId, Options } from "./options.types";
import type { Subscription, StorageService } from "./services";

export interface WalletSelectorParams {
  network: NetworkId | Network;
  modules: Array<WalletModuleFactory>;
  storage?: StorageService;
  debug?: boolean;
}

export type WalletSelectorStore = ReadOnlyStore;

export type WalletSelectorEvents = {
  networkChanged: { walletId: string; networkId: string };
};

export interface WalletSelector {
  options: Options;
  store: WalletSelectorStore;

  wallet<Variation extends Wallet = Wallet>(id?: string): Promise<Variation>;

  isSignedIn(): boolean;

  on<EventName extends keyof WalletSelectorEvents>(
    eventName: EventName,
    callback: (event: WalletSelectorEvents[EventName]) => void
  ): Subscription;

  off<EventName extends keyof WalletSelectorEvents>(
    eventName: EventName,
    callback: (event: WalletSelectorEvents[EventName]) => void
  ): void;
}
