import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PasswordInput } from "./password-input";
import { Label } from "@/components/ui/label";

function renderWithLabel(props: React.ComponentProps<typeof PasswordInput>) {
  return render(
    <>
      <Label htmlFor={props.id}>Password</Label>
      <PasswordInput {...props} />
    </>,
  );
}

describe("<PasswordInput />", () => {
  it("renders a password field by default", () => {
    renderWithLabel({ id: "password", name: "password" });
    const input = screen.getByLabelText(/^password$/i);
    expect(input).toHaveAttribute("type", "password");
  });

  it("toggles to text when the show-password button is clicked", () => {
    renderWithLabel({ id: "password", name: "password" });
    const input = screen.getByLabelText(/^password$/i);
    const toggle = screen.getByRole("button", { name: "Show password" });

    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "password");
    expect(
      screen.getByRole("button", { name: "Show password" }),
    ).toBeInTheDocument();
  });

  it("does not submit the surrounding form when clicked", () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" />
      </form>,
    );
    const toggle = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggle);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
