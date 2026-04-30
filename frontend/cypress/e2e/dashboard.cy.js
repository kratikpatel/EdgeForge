describe("EdgeForge Dashboard", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("loads the dashboard page", () => {
    cy.contains("EdgeForge Dashboard").should("be.visible");
  });

  it("displays the health indicator", () => {
    cy.contains("Backend Health").should("be.visible");
  });

  it("displays all five stats cards", () => {
    cy.contains("Uptime (sec)").should("be.visible");
    cy.contains("Requests Total").should("be.visible");
    cy.contains("Errors Total").should("be.visible");
    cy.contains("Rate Limited").should("be.visible");
    cy.contains("Active Sims").should("be.visible");
  });

  it("has a send test request button that can be clicked", () => {
    cy.contains("Send Test Request").should("be.visible").click();
    cy.contains("Last Response").should("be.visible");
  });

  it("displays chart sections", () => {
    cy.contains("Requests / sec").should("be.visible");
    cy.contains("Errors / sec").should("be.visible");
    cy.contains("Rate Limited / sec").should("be.visible");
  });

  it("toggles dark mode and persists across reload", () => {
    cy.window().then((win) => win.localStorage.clear());
    cy.reload();
    cy.contains("Show Settings").click();
    cy.get('select[aria-label="Theme"]').select("dark");
    cy.get("html").should("have.attr", "data-theme", "dark");
    cy.reload();
    cy.get("html").should("have.attr", "data-theme", "dark");
  });

  it("renders the Services Status panel with at least one instance row", () => {
    cy.contains("Services Status").should("be.visible");
    cy.get('[data-instance-name]').should("have.length.gte", 1);
  });

  it("exposes the alert threshold control in settings", () => {
    cy.window().then((win) => win.localStorage.clear());
    cy.reload();
    cy.contains("Show Settings").click();
    cy.get('input[aria-label="Enable error rate alerts"]').should("exist").and("be.checked");
    cy.get('input[aria-label="Error rate alert threshold"]').should("have.value", "10");
  });
});
