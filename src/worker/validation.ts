import { z } from "zod";

export const householdSchema = z.object({
  name: z.string().trim().min(2).max(60),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(140),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  dueAt: z.string().datetime().nullable().optional(),
});

export const taskUpdateSchema = z.object({
  status: z.enum(["todo", "done"]),
});

export const grocerySchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.string().trim().max(40).default("1"),
});

export const groceryUpdateSchema = z.object({
  checked: z.boolean(),
});
