export type HouseholdRole = "owner" | "admin" | "member" | "child";

export type Task = {
  id: string;
  title: string;
  status: "todo" | "done";
  priority: "low" | "normal" | "high";
  dueAt: number | null;
  createdAt: number;
};

export type GroceryItem = {
  id: string;
  name: string;
  quantity: string;
  checked: number;
  createdAt: number;
};

export type HouseholdEvent = {
  id: string;
  title: string;
  startsAt: number;
  endsAt: number | null;
  location: string | null;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  visibility: "household" | "admin" | "private";
  updatedAt: number;
};

export type Member = {
  id: string;
  displayName: string;
  email: string;
  role: HouseholdRole;
};

export type Household = {
  id: string;
  name: string;
  slug: string;
  role: HouseholdRole;
  members: Member[];
  tasks: Task[];
  groceries: GroceryItem[];
  events: HouseholdEvent[];
  notes: Note[];
};

export type Bootstrap = {
  user: { id: string; name: string; email: string };
  household: Household | null;
};
