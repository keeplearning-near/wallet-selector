import { resolveOptions } from "./options";
import { createStore } from "./store";
import type {
  WalletSelector,
  WalletSelectorEvents,
  WalletSelectorParams,
} from "./wallet-selector.types";
import { EventEmitter, Logger, WalletModules } from "./services";
import type { Wallet } from "./wallet";

let walletSelectorInstance: WalletSelector | null = null;

export const setupWalletSelector = async (
  params: WalletSelectorParams
): Promise<WalletSelector> => {
  const { options, storage } = resolveOptions(params);
  Logger.debug = options.debug;

  const emitter = new EventEmitter<WalletSelectorEvents>();
  const store = await createStore(storage);
  const walletModules = new WalletModules({
    factories: params.modules,
    storage,
    options,
    store,
    emitter,
  });

  await walletModules.setup();

  if (!walletSelectorInstance) {
    walletSelectorInstance = {
      options,
      store: store.toReadOnly(),
      wallet: async <Variation extends Wallet = Wallet>(id?: string) => {
        const { selectedWalletId } = store.getState();
        const wallet = await walletModules.getWallet<Variation>(
          id || selectedWalletId
        );

        if (!wallet) {
          if (id) {
            throw new Error("Invalid wallet id");
          }

          throw new Error("No wallet selected");
        }

        return wallet;
      },
      isSignedIn() {
        const { accounts } = store.getState();

        return Boolean(accounts.length);
      },
      on: (eventName, callback) => {
        return emitter.on(eventName, callback);
      },
      off: (eventName, callback) => {
        emitter.off(eventName, callback);
      },
    };
  }

  return walletSelectorInstance;
};
