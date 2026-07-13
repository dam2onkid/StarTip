// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import type { CreatorProfile } from "@/app/(auth)/dashboard/creator/types";
import { ProfilePendingGate } from "@/app/(auth)/dashboard/creator/gates/profile-pending";
import { WalletPendingGate } from "@/app/(auth)/dashboard/creator/gates/wallet-pending";
import { OnchainPendingGate } from "@/app/(auth)/dashboard/creator/gates/onchain-pending";
import type { Status } from "@/app/(auth)/dashboard/creator/types";

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const connectWallet = vi.hoisted(() => vi.fn());
const getWalletAddress = vi.hoisted(() => vi.fn());
const signWalletMessage = vi.hoisted(() => vi.fn());
const classifySignMessageError = vi.hoisted(() => vi.fn((): "unsupported" | "unknown" => "unknown"));
const registerCreatorOnChain = vi.hoisted(() => vi.fn());
const readTreasuryAddress = vi.hoisted(() => vi.fn(async () => null));
const payoutAddressWarning = vi.hoisted(() => vi.fn((): "contract" | "treasury" | null => null));

vi.mock("@/lib/wallet/kit", () => ({
  connectWallet,
  getWalletAddress,
  signWalletMessage,
  classifySignMessageError,
}));

vi.mock("@/lib/onboarding/register", () => ({
  registerCreatorOnChain,
  readTreasuryAddress,
  payoutAddressWarning,
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
  networkPassphrase: "Test SDF Network ; September 2015",
  getRpc: vi.fn(),
}));

function profile(over: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    id: "p1",
    user_id: "u1",
    display_name: "Anonymous",
    avatar_url: null,
    banner_url: null,
    bio: null,
    handle: null,
    owner_address: null,
    onchain_registered: false,
    overlay_id: null,
    paused: false,
    ...over,
  };
}

function mockFetch(responses: Array<(url: string, init?: RequestInit) => Response>) {
  const calls = responses.slice();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString();
    const next = calls.shift();
    if (!next) throw new Error(`unexpected fetch ${u}`);
    return next(u, init);
  }) as unknown as typeof fetch;
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  connectWallet.mockReset();
  getWalletAddress.mockReset();
  signWalletMessage.mockReset();
  classifySignMessageError.mockReset().mockReturnValue("unknown");
  registerCreatorOnChain.mockReset();
  readTreasuryAddress.mockReset().mockResolvedValue(null);
  payoutAddressWarning.mockReset().mockReturnValue(null);
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    throw new Error(`unexpected fetch ${url.toString()}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ProfilePendingGateWrapper({
  current,
  onClaimed,
}: {
  current: CreatorProfile;
  onClaimed: (p: Partial<CreatorProfile>) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  return (
    <ProfilePendingGate
      current={current}
      status={status}
      setStatus={setStatus}
      onClaimed={onClaimed}
    />
  );
}

function WalletPendingGateWrapper({
  current,
  onLinked,
}: {
  current: CreatorProfile;
  onLinked: (ownerAddress: string) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  return (
    <WalletPendingGate
      current={current}
      status={status}
      setStatus={setStatus}
      onLinked={onLinked}
    />
  );
}

function OnchainPendingGateWrapper({
  current,
  onSubmitted,
  onReconciled,
}: {
  current: CreatorProfile;
  onSubmitted: () => void;
  onReconciled: (next: Partial<CreatorProfile>) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  return (
    <OnchainPendingGate
      current={current}
      status={status}
      setStatus={setStatus}
      onSubmitted={() => {
        setStatus({ kind: "info", message: "Registration submitted." });
        onSubmitted();
      }}
      onReconciled={(next) => {
        setStatus({ kind: "info", message: "You are live on-chain." });
        onReconciled(next);
      }}
    />
  );
}

describe("ProfilePendingGate", () => {
  it("opens the claim form, runs dryRun availability, then claims on submit", async () => {
    mockFetch([
      () => jsonRes(200, { available: true, handle: "ada" }),
      () => jsonRes(200, { handle: "ada", handle_hash: "ab".repeat(32) }),
    ]);
    const onClaimed = vi.fn();
    render(<ProfilePendingGateWrapper current={profile()} onClaimed={onClaimed} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /become a creator/i }));
    });
    const input = screen.getByPlaceholderText("ada-lovelace");
    await act(async () => {
      fireEvent.change(input, { target: { value: "ada" } });
    });
    await waitFor(() => {
      expect(screen.getByText(/Handle is available/i)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Claim$/i }));
    });
    await waitFor(() => {
      expect(onClaimed).toHaveBeenCalledWith({ handle: "ada" });
    });
  });

  it("shows a taken pill when dryRun returns 409", async () => {
    mockFetch([() => jsonRes(409, { error: "handle_taken", reason: "offchain_taken" })]);
    render(<ProfilePendingGateWrapper current={profile()} onClaimed={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /become a creator/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("ada-lovelace"), {
        target: { value: "ada" },
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Handle is taken/i)).toBeInTheDocument();
    });
  });
});

describe("WalletPendingGate", () => {
  it("connects, signs the challenge, and calls onLinked", async () => {
    connectWallet.mockResolvedValue(undefined);
    getWalletAddress.mockResolvedValue(STUB_ADDRESS);
    signWalletMessage.mockResolvedValue({ signedMessage: "deadbeef", signerAddress: STUB_ADDRESS });
    mockFetch([
      () => jsonRes(200, { challenge: "StarTip wallet link\nHandle: ada\nProfile: x\nNonce: n" }),
      () => jsonRes(200, { owner_address: STUB_ADDRESS }),
    ]);
    const onLinked = vi.fn();
    render(<WalletPendingGateWrapper current={profile({ handle: "ada" })} onLinked={onLinked} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Connected:/i)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign challenge & link/i }));
    });
    await waitFor(() => {
      expect(onLinked).toHaveBeenCalledWith(STUB_ADDRESS);
    });
    expect(signWalletMessage).toHaveBeenCalled();
  });

  it("shows the message-incapable wallet guidance when signMessage is unsupported", async () => {
    connectWallet.mockResolvedValue(undefined);
    getWalletAddress.mockResolvedValue(STUB_ADDRESS);
    signWalletMessage.mockRejectedValue(new Error("does not support signMessage"));
    classifySignMessageError.mockReturnValue("unsupported");
    mockFetch([() => jsonRes(200, { challenge: "c" })]);
    render(<WalletPendingGateWrapper current={profile({ handle: "ada" })} onLinked={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign challenge & link/i }));
    });
    await waitFor(() => {
      expect(
        screen.getByText(/Reconnect with a message-signing wallet like Freighter/i),
      ).toBeInTheDocument();
    });
  });
});

describe("OnchainPendingGate", () => {
  it("submits register_creator and calls onSubmitted", async () => {
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
    registerCreatorOnChain.mockResolvedValue({ status: "PENDING", hash: "txhash" });
    const onSubmitted = vi.fn();
    const onReconciled = vi.fn();
    render(
      <OnchainPendingGateWrapper
        current={profile({ handle: "ada", owner_address: STUB_ADDRESS })}
        onSubmitted={onSubmitted}
        onReconciled={onReconciled}
      />,
    );
    const input = screen.getByPlaceholderText("G…");
    await act(async () => {
      fireEvent.change(input, { target: { value: "GBPAYOUT" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register creator/i }));
    });
    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalled();
    });
    expect(registerCreatorOnChain).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "ada", ownerAddress: STUB_ADDRESS, payoutAddress: "GBPAYOUT" }),
    );
  });

  it("shows a button spinner while register_creator is being submitted", async () => {
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
    let resolveRegister: (value: { status: string; hash: string }) => void = () => {};
    registerCreatorOnChain.mockReturnValue(
      new Promise((resolve) => {
        resolveRegister = resolve;
      }),
    );
    render(
      <OnchainPendingGateWrapper
        current={profile({ handle: "ada", owner_address: STUB_ADDRESS })}
        onSubmitted={vi.fn()}
        onReconciled={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("G…"), { target: { value: "GBPAYOUT" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register creator/i }));
    });
    const submittingButton = screen.getByRole("button", { name: /register creator/i });
    expect(submittingButton).toBeDisabled();
    expect(submittingButton.querySelector("svg.animate-spin")).not.toBeNull();
    await act(async () => {
      resolveRegister({ status: "PENDING", hash: "txhash" });
    });
  });

  it("renders the stranded-funds warning when payoutAddressWarning returns 'contract'", async () => {
    mockFetch([() => jsonRes(200, { onchain_registered: false })]);
    payoutAddressWarning.mockReturnValue("contract");
    render(
      <OnchainPendingGateWrapper
        current={profile({ handle: "ada", owner_address: STUB_ADDRESS })}
        onSubmitted={vi.fn()}
        onReconciled={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("G…"), { target: { value: "C-TEST" } });
    });
    await waitFor(() => {
      expect(screen.getByText(/contract address/i)).toBeInTheDocument();
    });
  });

  it("calls onReconciled when the mount reconcile finds the creator registered", async () => {
    const onReconciled = vi.fn();
    mockFetch([() => jsonRes(200, { onchain_registered: true, payout_address: "GBPAYOUT", overlay_id: "abc123" })]);
    render(
      <OnchainPendingGateWrapper
        current={profile({ handle: "ada", owner_address: STUB_ADDRESS })}
        onSubmitted={vi.fn()}
        onReconciled={onReconciled}
      />,
    );
    await waitFor(() => {
      expect(onReconciled).toHaveBeenCalledWith({ payout_address: "GBPAYOUT", overlay_id: "abc123" });
    });
  });
});
