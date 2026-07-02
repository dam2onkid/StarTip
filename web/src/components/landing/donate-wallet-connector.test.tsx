// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * DonateWalletConnector unit tests (PRD: Unified hybrid navigation, issue 02).
 *
 * The connector is the nav's always-visible Donate Wallet surface. The Stellar
 * Wallets Kit cannot run in jsdom, so the kit is mocked at the module boundary
 * and the Stellar Expert URL helper is mocked to keep these tests focused on
 * the connector's behavior: the disconnected / connected states, the address
 * truncation, and the three dropdown menu actions.
 */

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const connectWallet = vi.fn();
const disconnectWallet = vi.fn();
const stellarExpertAccountUrl = vi.fn(
  (address: string) => `https://stellar.expert/explorer/testnet/account/${address}`,
);

vi.mock("@/lib/wallet/kit", () => ({
  connectWallet,
  disconnectWallet,
}));

vi.mock("@/lib/stellar/client", () => ({
  stellarExpertAccountUrl,
  networkPassphrase: "Test SDF Network ; September 2015",
  isPubnet: false,
}));

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  connectWallet.mockReset();
  disconnectWallet.mockReset();
  stellarExpertAccountUrl.mockClear();
  writeText.mockReset();
  // jsdom does not implement the async clipboard API. Install a minimal stub so
  // the Copy address menu item can be exercised without a real browser.
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderConnector() {
  const { DonateWalletProvider } = await import("./donate-wallet-context");
  const { DonateWalletConnector } = await import("./donate-wallet-connector");
  return render(
    <DonateWalletProvider>
      <DonateWalletConnector />
    </DonateWalletProvider>,
  );
}

async function connectStubWallet() {
  connectWallet.mockResolvedValue({ address: STUB_ADDRESS });
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: /connect wallet/i }),
    );
  });
  await waitFor(() =>
    expect(screen.getByLabelText(/connected wallet/i)).toBeInTheDocument(),
  );
}

async function openDropdown() {
  const trigger = screen.getByLabelText(/connected wallet/i);
  await act(async () => {
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.pointerUp(trigger);
    fireEvent.click(trigger);
  });
  await waitFor(() =>
    expect(
      screen.getByRole("menuitem", { name: /copy address/i }),
    ).toBeInTheDocument(),
  );
}

describe("DonateWalletConnector — disconnected state", () => {
  it("renders a 'Connect wallet' button when no wallet is connected", async () => {
    await renderConnector();
    expect(
      screen.getByRole("button", { name: /connect wallet/i }),
    ).toBeInTheDocument();
  });
});

describe("DonateWalletConnector — connect transition", () => {
  it("calls connectWallet and shows the connected pill on success", async () => {
    await renderConnector();
    await connectStubWallet();

    expect(connectWallet).toHaveBeenCalledOnce();
    // The connected pill is labelled with the full address for AT users.
    expect(
      screen.getByLabelText(new RegExp(STUB_ADDRESS, "i")),
    ).toBeInTheDocument();
  });

  it("truncates the address to the first 4 and last 4 characters with an ellipsis", async () => {
    await renderConnector();
    await connectStubWallet();

    const expected = `${STUB_ADDRESS.slice(0, 4)}…${STUB_ADDRESS.slice(-4)}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe("DonateWalletConnector — connected dropdown", () => {
  it("opens a menu with Copy address, View on Stellar, and Disconnect", async () => {
    await renderConnector();
    await connectStubWallet();
    await openDropdown();

    expect(
      screen.getByRole("menuitem", { name: /copy address/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /view on stellar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /disconnect/i }),
    ).toBeInTheDocument();
  });
});

describe("DonateWalletConnector — copy address", () => {
  it("copies the full address to the clipboard", async () => {
    writeText.mockResolvedValue(undefined);
    await renderConnector();
    await connectStubWallet();
    await openDropdown();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("menuitem", { name: /copy address/i }),
      );
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(STUB_ADDRESS));
    expect(writeText).toHaveBeenCalledOnce();
  });
});

describe("DonateWalletConnector — view on Stellar", () => {
  it("links to the Stellar Expert account URL for the active network", async () => {
    await renderConnector();
    await connectStubWallet();
    await openDropdown();

    const view = screen.getByRole("menuitem", { name: /view on stellar/i });
    expect(view).toHaveAttribute(
      "href",
      stellarExpertAccountUrl(STUB_ADDRESS),
    );
    expect(stellarExpertAccountUrl).toHaveBeenCalledWith(STUB_ADDRESS);
  });
});

describe("DonateWalletConnector — disconnect", () => {
  it("calls disconnectWallet and reverts to the disconnected state", async () => {
    disconnectWallet.mockResolvedValue(undefined);
    await renderConnector();
    await connectStubWallet();
    await openDropdown();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("menuitem", { name: /disconnect/i }),
      );
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /connect wallet/i }),
      ).toBeInTheDocument(),
    );
    expect(disconnectWallet).toHaveBeenCalledOnce();
    // The connected pill is gone.
    expect(screen.queryByLabelText(/connected wallet/i)).not.toBeInTheDocument();
  });
});
