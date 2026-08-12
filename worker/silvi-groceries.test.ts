import { describe, expect, it } from "vitest";
import { parseGroceryNeed } from "./silvi-groceries";

describe("Silvi grocery intent", () => {
  it("understands a natural household need with a store", () => {
    expect(parseGroceryNeed("We need to get Arizona Iced Tea from Albert Hein")).toEqual({
      item: "Arizona Iced Tea",
      store: "Albert Hein",
      general: false,
    });
  });

  it("understands direct grocery-list requests", () => {
    expect(parseGroceryNeed("Could you add some milk to the grocery list?")).toEqual({
      item: "milk",
      store: null,
      general: false,
    });
  });

  it("keeps explicit general-grocery requests out of store clarification", () => {
    expect(parseGroceryNeed("Put eggs in General Groceries")).toEqual({
      item: "eggs",
      store: null,
      general: true,
    });
  });

  it("does not treat unrelated questions as groceries", () => {
    expect(parseGroceryNeed("What do we need to finish before school?")).toBeNull();
    expect(parseGroceryNeed("Add a task to clean the kitchen")).toBeNull();
  });
});
