// import type { WalletSelector, WalletSelectorUIComponent } from "@near-wallet-selector/core";
import { Component, Method, h, State } from "@stencil/core";

@Component({
  tag: "wallet-selector",
  styleUrl: "wallet-selector.scss",
  shadow: true,
})
export class WalletSelectorComponent {

  @State() selector: unknown;
  @State() routeName = "WalletOptions";
  @State() errorMessage: string;

  @Method()
  async setSelector(selector: unknown): Promise<void> {
    this.selector = selector;
  }

  handleDismissClick() {
    const component = document.querySelector('wallet-selector-modal');
    component.hide();
    this.routeName = "WalletOptions";
    this.errorMessage = null;
  }

  render() {
    return (
      <div class="Modal-content">
        <div class="Modal-header">
          <slot name="title">
            <h2>Connect Wallet</h2>
          </slot>
          <slot name="close-btn" />
        </div>
        {
          this.routeName === "AlertMessage" &&
            <alert-message
              message={this.errorMessage}
              onNearBackEvent={() => {
                this.errorMessage = null;
                this.routeName = "WalletOptions";
              } }
            />
        }
        {
          this.routeName === "WalletOptions" &&
          <wallet-options
            selector={this.selector}
            onNearConnectHardwareWallet={() => {
              this.routeName = "LedgerDerivationPath"
            }}
            onNearErrorWalletOptions={(e) => {
              this.errorMessage = e.detail;
              this.routeName = "AlertMessage";
            }}
            onNearConnected={this.handleDismissClick}
          />
        }
        {
          this.routeName === "LedgerDerivationPath" &&
          <ledger-derivation-path
            selector={this.selector}
            onNearBackEventLedger={() => {{ this.routeName = "WalletOptions"; }}}
          />
        }

        {
          this.routeName === "WalletNetworkChanged" &&
            <wallet-network-changed
              selector={this.selector}
              onNearSwitchWallet={() => {
                this.routeName = "WalletOptions";
              }}
              onNearWalletNetworkDismiss={this.handleDismissClick}
            />
        }

          {/* {routeName === "WalletOptions" && (
            <WalletOptions
              selector={selector}
              options={options}
              onWalletNotInstalled={(wallet) => {
                setNotInstalledWallet(wallet);
                return setRouteName("WalletNotInstalled");
              }}
              onConnectHardwareWallet={() => {
                setRouteName("LedgerDerivationPath");
              }}
              onConnected={handleDismissClick}
              onError={(message) => {
                setAlertMessage(message);
                setRouteName("AlertMessage");
              }}
            />
          )} */}
          {/* {routeName === "LedgerDerivationPath" && (
            <LedgerDerivationPath
              selector={selector}
              onConnected={handleDismissClick}
              onBack={() => setRouteName("WalletOptions")}
            />
          )} */}
          {/* {routeName === "WalletNotInstalled" && notInstalledWallet && (
            <WalletNotInstalled
              notInstalledWallet={notInstalledWallet}
              onBack={() => {
                setNotInstalledWallet(null);
                setRouteName("WalletOptions");
              }}
            />
          )} */}
          {/* {routeName === "WalletNetworkChanged" && (
            <WalletNetworkChanged
              selector={selector}
              onSwitchWallet={() => setRouteName("WalletOptions")}
              onDismiss={handleDismissClick}
            />
          )} */}
        </div>
    );
  }
}
