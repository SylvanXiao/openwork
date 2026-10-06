import { expect } from "vitest";
import { evalIn, waitFor } from "@openwork/behaviors";
import { needs, spec, unmetNeeds } from "@openwork/testkit";
import type { TestNeeds } from "@openwork/testkit";
import { connectorsPage } from "../worlds/connectors-page.ts";

const test = spec.world(connectorsPage);

const requirements: TestNeeds = {
  optIn: ["OPENWORK_EVAL_E2E_TESTS"],
};
const missingRequirements = unmetNeeds(requirements, process.env);
const title = missingRequirements.length > 0
  ? `Connectors page skipped — needs: ${missingRequirements.join(", ")}`
  : "Connectors page registers a local MCP and probes it through the engine";

test(title, async ({ world, user }) => {
  needs(requirements);
  const { app, mockMcpCommand } = world;

  // Open the page the way a user does: the sidebar Connectors entry. On the
  // web surface the connectors route is pathname-based, so hash navigation
  // would change the URL without mounting the page.
  const opened = await evalIn(app, () => {
    const button = [...document.querySelectorAll("button")]
      .find((entry) => (entry.textContent ?? "").trim() === "Connectors");
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  });
  expect(opened).toBe(true);
  await waitFor(app, () => document.querySelector("[data-connectors-page]") !== null, {
    timeoutMs: 30_000,
    label: "connectors route stays mounted instead of bouncing back to the session",
  });

  // Platform connectors: the Feishu card renders its two-step guide and the
  // register action stays locked until both credentials are present.
  await user.see({ text: "Platform connectors" });
  await user.see({ text: "Feishu / Lark" });
  await user.see({ text: "Step 1: Authorize in your browser" });
  const registerState = await evalIn(app, () => {
    const card = document.querySelector<HTMLElement>('[data-platform-connector="feishu"]');
    const button = card
      ? [...card.querySelectorAll("button")]
          .find((entry) => (entry.textContent ?? "").trim() === "Register Feishu MCP")
      : null;
    return button instanceof HTMLButtonElement
      ? { found: true, disabled: button.disabled }
      : { found: false, disabled: false };
  });
  expect(registerState).toEqual({ found: true, disabled: true });

  // My MCPs starts empty.
  await user.see({ text: "No MCP servers yet" });

  // Register a zero-dependency stdio MCP through the Add MCP modal.
  await user.click({ text: "Add MCP" });
  await user.see({ text: "Add workspace MCP" });
  await user.type({ label: "App name" }, "probe-mock");
  await user.click({ text: "Local process (command)" });
  // The Command field's label node also carries its hint text, so target the
  // stable placeholder instead of the accessible name.
  await user.type({ placeholder: "npx -y @modelcontextprotocol/server-sequential-thinking" }, mockMcpCommand);
  await user.click({ text: "Add App" });
  await user.see({ text: "probe-mock" });
  await user.see({ text: "stdio" });

  // The row's Test button drives POST /workspace/:id/mcp/:name/test; the
  // server opens a real MCP session against the mock and reports the tool
  // count, and the row flips to the connected result line.
  const probed = await evalIn(app, () => {
    const section = document.querySelector<HTMLElement>('[data-section="custom"]');
    const button = section
      ? [...section.querySelectorAll("button")]
          .find((entry) => (entry.textContent ?? "").trim() === "Test")
      : null;
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  });
  expect(probed).toBe(true);
  // The engine picks up a freshly registered MCP asynchronously, so a single
  // probe can legitimately land before the engine has a status for it.
  // Re-probe until the row settles on the connected result line.
  const deadline = Date.now() + 90_000;
  let row = "";
  while (Date.now() < deadline) {
    await evalIn(app, () => {
      const section = document.querySelector<HTMLElement>('[data-section="custom"]');
      const button = section
        ? [...section.querySelectorAll("button")]
            .find((entry) => (entry.textContent ?? "").trim() === "Test")
        : null;
      if (button instanceof HTMLButtonElement) button.click();
      return true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    row = await evalIn(app, () =>
      document.querySelector<HTMLElement>('[data-section="custom"] li')?.innerText ?? "");
    if (/Connected · \d+ tools/.test(row)) break;
  }
  console.error("probe row:", JSON.stringify(row));
  expect(row).toContain("Connected · 3 tools");
});
