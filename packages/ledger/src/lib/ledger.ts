import { isMobile } from "is-mobile";
import { TypedError } from "near-api-js/lib/utils/errors";
import { signTransactions } from "@near-wallet-selector/wallet-utils";
import type {
  WalletModuleFactory,
  WalletBehaviourFactory,
  JsonStorageService,
  AccountState,
  Account,
  HardwareWallet,
  Transaction,
  Optional,
} from "@near-wallet-selector/core";

import { isLedgerSupported, LedgerClient } from "./ledger-client";
import type { Subscription } from "./ledger-client";
import { Signer, utils } from "near-api-js";

interface LedgerAccount extends Account {
  derivationPath: string;
  publicKey: string;
}

interface ValidateAccessKeyParams {
  accountId: string;
  publicKey: string;
}

interface GetAccountIdFromPublicKeyParams {
  publicKey: string;
}

interface LedgerState {
  client: LedgerClient;
  accounts: Array<LedgerAccount>;
  subscriptions: Array<Subscription>;
}

export interface LedgerParams {
  iconUrl?: string;
}

export const STORAGE_ACCOUNTS = "accounts";

const setupLedgerState = async (
  storage: JsonStorageService
): Promise<LedgerState> => {
  const accounts = await storage.getItem<Array<LedgerAccount>>(
    STORAGE_ACCOUNTS
  );

  return {
    client: new LedgerClient(),
    subscriptions: [],
    accounts: accounts || [],
  };
};

const Ledger: WalletBehaviourFactory<HardwareWallet> = async ({
  options,
  store,
  provider,
  logger,
  storage,
}) => {
  const _state = await setupLedgerState(storage);

  const signer: Signer = {
    createKey: () => {
      throw new Error("Not implemented");
    },
    getPublicKey: async (accountId) => {
      const account = _state.accounts.find((a) => a.accountId === accountId);

      if (!account) {
        throw new Error("Failed to find public key for account");
      }

      return utils.PublicKey.from(account.publicKey);
    },
    signMessage: async (message, accountId) => {
      const account = _state.accounts.find((a) => a.accountId === accountId);

      if (!account) {
        throw new Error("Failed to find account for signing");
      }

      const signature = await _state.client.sign({
        data: message,
        derivationPath: account.derivationPath,
      });

      return {
        signature,
        publicKey: utils.PublicKey.from(account.publicKey),
      };
    },
  };

  const getAccounts = (): Array<AccountState> => {
    return _state.accounts.map((x) => ({
      accountId: x.accountId,
    }));
  };

  const cleanup = () => {
    _state.subscriptions.forEach((subscription) => subscription.remove());

    _state.subscriptions = [];
    _state.accounts = [];

    storage.removeItem(STORAGE_ACCOUNTS);
  };

  const signOut = async () => {
    if (_state.client.isConnected()) {
      await _state.client.disconnect().catch((err) => {
        logger.log("Failed to disconnect device");
        logger.error(err);
      });
    }

    cleanup();
  };

  const connectLedgerDevice = async () => {
    if (_state.client.isConnected()) {
      return;
    }

    await _state.client.connect();
  };

  const validateAccessKey = ({
    accountId,
    publicKey,
  }: ValidateAccessKeyParams) => {
    logger.log("validateAccessKey", { accountId, publicKey });

    return provider.viewAccessKey({ accountId, publicKey }).then(
      (accessKey) => {
        logger.log("validateAccessKey:accessKey", { accessKey });

        if (accessKey.permission !== "FullAccess") {
          throw new Error("Public key requires 'FullAccess' permission");
        }

        return accessKey;
      },
      (err) => {
        if (err instanceof TypedError && err.type === "AccessKeyDoesNotExist") {
          return null;
        }

        throw err;
      }
    );
  };

  const getAccountIdFromPublicKey = async ({
    publicKey,
  }: GetAccountIdFromPublicKeyParams): Promise<string> => {
    const response = await fetch(
      `${options.network.indexerUrl}/publicKey/ed25519:${publicKey}/accounts`
    );

    if (!response.ok) {
      throw new Error("Failed to get account id from public key");
    }

    const accountIds = await response.json();

    if (!Array.isArray(accountIds) || !accountIds.length) {
      throw new Error(
        "Failed to find account linked for public key: " + publicKey
      );
    }

    return accountIds[0];
  };

  const transformTransactions = (
    transactions: Array<Optional<Transaction, "signerId" | "receiverId">>
  ): Array<Transaction> => {
    const accounts = getAccounts();
    const { contract } = store.getState();

    if (!accounts.length || !contract) {
      throw new Error("Wallet not signed in");
    }

    return transactions.map((transaction) => {
      return {
        signerId: transaction.signerId || accounts[0].accountId,
        receiverId: transaction.receiverId || contract.contractId,
        actions: transaction.actions,
      };
    });
  };

  return {
    async signIn({ derivationPaths }) {
      const existingAccounts = getAccounts();

      if (existingAccounts.length) {
        return existingAccounts;
      }

      if (!derivationPaths.length) {
        throw new Error("Invalid derivation paths");
      }

      // Note: Connection must be triggered by user interaction.
      await connectLedgerDevice();

      const accounts: Array<LedgerAccount> = [];

      for (let i = 0; i < derivationPaths.length; i += 1) {
        const derivationPath = derivationPaths[i];
        const publicKey = await _state.client.getPublicKey({ derivationPath });
        const accountId = await getAccountIdFromPublicKey({ publicKey });

        if (accounts.some((x) => x.accountId === accountId)) {
          throw new Error("Duplicate account id: " + accountId);
        }

        const accessKey = await validateAccessKey({ accountId, publicKey });

        if (!accessKey) {
          throw new Error(
            `Public key is not registered with the account '${accountId}'.`
          );
        }

        accounts.push({
          accountId,
          derivationPath,
          publicKey,
        });
      }

      await storage.setItem(STORAGE_ACCOUNTS, accounts);
      _state.accounts = accounts;

      return getAccounts();
    },

    signOut,

    async getAccounts() {
      return getAccounts();
    },

    async signAndSendTransaction({ signerId, receiverId, actions }) {
      logger.log("signAndSendTransaction", { signerId, receiverId, actions });

      if (!_state.accounts.length) {
        throw new Error("Wallet not signed in");
      }

      // Note: Connection must be triggered by user interaction.
      await connectLedgerDevice();

      const signedTransactions = await signTransactions(
        transformTransactions([{ signerId, receiverId, actions }]),
        signer,
        options.network
      );

      return provider.sendTransaction(signedTransactions[0]);
    },

    async signAndSendTransactions({ transactions }) {
      logger.log("signAndSendTransactions", { transactions });

      if (!_state.accounts.length) {
        throw new Error("Wallet not signed in");
      }

      // Note: Connection must be triggered by user interaction.
      await connectLedgerDevice();

      const signedTransactions = await signTransactions(
        transformTransactions(transactions),
        signer,
        options.network
      );

      return Promise.all(
        signedTransactions.map((signedTx) => provider.sendTransaction(signedTx))
      );
    },
  };
};

export function setupLedger({
  iconUrl = "./assets/ledger-icon.png",
}: LedgerParams = {}): WalletModuleFactory<HardwareWallet> {
  return async () => {
    const mobile = isMobile();
    const supported = isLedgerSupported();

    if (mobile || !supported) {
      return null;
    }

    return {
      id: "ledger",
      type: "hardware",
      metadata: {
        name: "Ledger",
        description: null,
        iconUrl,
        deprecated: false,
      },
      init: Ledger,
    };
  };
}
