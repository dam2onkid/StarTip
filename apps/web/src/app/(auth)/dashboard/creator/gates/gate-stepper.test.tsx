// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GateStepper } from "./gate-stepper";

describe("GateStepper", () => {
  it("renders the progress bar fill with full width so scaleX is visible", () => {
    render(<GateStepper state="profile_pending" />);
    const bar = screen.getByTestId("gate-stepper-bar");
    expect(bar).toHaveClass("w-full");
    expect(bar).toHaveStyle({ transform: "scaleX(0)" });
  });
});
