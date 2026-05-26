import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgentFilterBar } from "./AgentFilterBar";

const AGENTS = ["Adriana Mourão", "Beatriz Santos", "Carlos Lima", "Daniela Souza"];

describe("AgentFilterBar", () => {
  it("renders default label when nothing selected", () => {
    render(<AgentFilterBar agents={AGENTS} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("Todos os agentes")).toBeInTheDocument();
  });

  it("renders the selected agent label", () => {
    render(<AgentFilterBar agents={AGENTS} selected="Beatriz Santos" onSelect={() => {}} />);
    expect(screen.getByText("Beatriz Santos")).toBeInTheDocument();
  });

  it("opens the list on trigger click and shows all agents + 'Todos'", () => {
    render(<AgentFilterBar agents={AGENTS} selected={null} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Todos os agentes/i }));
    expect(screen.getByPlaceholderText("Buscar agente...")).toBeInTheDocument();
    expect(screen.getByText("Todos")).toBeInTheDocument();
    for (const a of AGENTS) {
      expect(screen.getByText(a)).toBeInTheDocument();
    }
  });

  it("filters list by case-insensitive substring", () => {
    render(<AgentFilterBar agents={AGENTS} selected={null} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Todos os agentes/i }));
    fireEvent.change(screen.getByPlaceholderText("Buscar agente..."), {
      target: { value: "be" },
    });
    expect(screen.getByText("Beatriz Santos")).toBeInTheDocument();
    expect(screen.queryByText("Carlos Lima")).not.toBeInTheDocument();
    expect(screen.queryByText("Adriana Mourão")).not.toBeInTheDocument();
  });

  it("calls onSelect with the agent and closes the list", () => {
    const onSelect = vi.fn();
    render(<AgentFilterBar agents={AGENTS} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Todos os agentes/i }));
    fireEvent.click(screen.getByText("Carlos Lima"));
    expect(onSelect).toHaveBeenCalledWith("Carlos Lima");
    expect(screen.queryByPlaceholderText("Buscar agente...")).not.toBeInTheDocument();
  });

  it("'Todos' calls onSelect(null)", () => {
    const onSelect = vi.fn();
    render(<AgentFilterBar agents={AGENTS} selected="Beatriz Santos" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Beatriz Santos/i }));
    fireEvent.click(screen.getByText("Todos"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
