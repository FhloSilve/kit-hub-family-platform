import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  BellRing,
  CalendarDays,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  CookingPot,
  Heart,
  Lightbulb,
  Pencil,
  Plus,
  ShoppingBasket,
  Star,
  ThumbsUp,
  Utensils,
  X,
} from "lucide-react";
import type {
  GroceryItem,
  HouseholdMemberSummary,
  MealIngredient,
  MealPlan,
  MealPlannerResponse,
  MealRecipe,
  MealSuggestion,
  MealType,
  SaveMealPlanInput,
  SaveMealRecipeInput,
} from "../../shared/contracts";
import { api } from "../lib/api";

type Props = {
  data: MealPlannerResponse;
  members: HouseholdMemberSummary[];
  loading: boolean;
  householdId: string;
  demo: boolean;
  onChange: (data: MealPlannerResponse) => void;
  onGroceriesAdded: (items: GroceryItem[]) => void;
};

type MealEditor = { date: string; type: MealType; plan: MealPlan | null } | null;
const mealTypes: Array<{ value: MealType; label: string; emoji: string }> = [
  { value: "breakfast", label: "Breakfast", emoji: "🥐" },
  { value: "lunch", label: "Lunch", emoji: "🥪" },
  { value: "dinner", label: "Dinner", emoji: "🍲" },
  { value: "snack", label: "Snack", emoji: "🍎" },
];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

function readableReminder(minutes: number | null) {
  if (minutes === null) return null;
  if (minutes === 0) return "At mealtime";
  if (minutes < 60) return `${minutes} min before`;
  if (minutes === 60) return "1 hour before";
  if (minutes === 1440) return "1 day before";
  return `${Math.round(minutes / 60)} hours before`;
}

function parseIngredients(value: string): MealIngredient[] {
  return value.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const [quantity = "", ...nameParts] = trimmed.split("|");
    if (!nameParts.length) return [{ name: quantity.trim(), quantity: "1" }];
    const name = nameParts.join("|").trim();
    return name ? [{ name, quantity: quantity.trim() || "1" }] : [];
  });
}

function ingredientsText(recipe: MealRecipe | null) {
  return recipe?.ingredients.map((item) => `${item.quantity} | ${item.name}`).join("\n") ?? "";
}

export function MealsView({ data, members, loading, householdId, demo, onChange, onGroceriesAdded }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [mealEditor, setMealEditor] = useState<MealEditor>(null);
  const [recipeEditor, setRecipeEditor] = useState<MealRecipe | "new" | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [editingDietary, setEditingDietary] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  function updatePlan(plan: MealPlan) {
    const plans = data.plans.filter((item) => !(item.mealDate === plan.mealDate && item.mealType === plan.mealType));
    onChange({ ...data, plans: [...plans, plan] });
    setMealEditor(null);
  }

  async function removePlan(plan: MealPlan) {
    if (!window.confirm(`Remove ${plan.title} from the meal plan?`)) return;
    if (!demo) await api.deleteMealPlan(householdId, plan.id);
    onChange({ ...data, plans: data.plans.filter((item) => item.id !== plan.id) });
    setMealEditor(null);
  }

  function updateRecipe(recipe: MealRecipe) {
    onChange({ ...data, recipes: [recipe, ...data.recipes.filter((item) => item.id !== recipe.id)] });
    setRecipeEditor(null);
  }

  async function toggleFavorite(recipe: MealRecipe) {
    const updated = demo ? { ...recipe, favorite: !recipe.favorite } : await api.setMealRecipeFavorite(householdId, recipe.id, !recipe.favorite);
    updateRecipe(updated);
  }

  async function addIngredients(recipe: MealRecipe) {
    try {
      const result = demo
        ? { addedCount: recipe.ingredients.length, items: recipe.ingredients.map((ingredient) => ({ id: crypto.randomUUID(), name: ingredient.name, quantity: ingredient.quantity, checked: false, important: false, createdAt: new Date().toISOString() })) }
        : await api.addRecipeIngredientsToGroceries(householdId, recipe.id);
      onGroceriesAdded(result.items);
      setMessage(`${result.addedCount} ingredient${result.addedCount === 1 ? "" : "s"} added to Groceries.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ingredients could not be added to Groceries.");
    }
  }

  async function toggleVote(suggestion: MealSuggestion) {
    const voted = !suggestion.votedByMe;
    const result = demo ? { voted, votes: Math.max(0, suggestion.votes + (voted ? 1 : -1)) } : await api.setMealSuggestionVote(householdId, suggestion.id, voted);
    onChange({ ...data, suggestions: data.suggestions.map((item) => item.id === suggestion.id ? { ...item, ...result } : item) });
  }

  const weekEnd = days[6] ?? weekStart;
  return (
    <>
      <header className="today-heading module-heading meals-heading">
        <div>
          <span className="today-date">Milestone 5</span>
          <h1>Meals &amp; Dinner</h1>
          <p>Plan the week, keep favourite recipes close, and send ingredients straight to Groceries.</p>
        </div>
        {data.canManage && <button className="button button--primary" onClick={() => setMealEditor({ date: dateKey(new Date()), type: "dinner", plan: null })}><Plus /> Plan a meal</button>}
      </header>

      {message && <div className="meal-message"><ShoppingBasket /><span>{message}</span><button aria-label="Dismiss message" onClick={() => setMessage(null)}><X /></button></div>}

      <section className="meal-dietary-card">
        <span><Heart /></span>
        <div>
          <small>Dietary notes &amp; allergies</small>
          <strong>{data.dietaryNotes || "Nothing recorded yet"}</strong>
        </div>
        {data.canManage && <button onClick={() => setEditingDietary(true)}><Pencil /> Edit</button>}
      </section>

      <section className="meal-week-card">
        <header className="meal-week-toolbar">
          <div><CalendarDays /><span><strong>{weekStart.toLocaleDateString(undefined, { month: "long", day: "numeric" })} – {weekEnd.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</strong><small>Your household week</small></span></div>
          <nav>
            <button aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft /></button>
            <button onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
            <button aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight /></button>
          </nav>
        </header>
        {loading ? <div className="meal-loading">Opening the family menu…</div> : <div className="meal-week-grid">
          {days.map((day) => {
            const key = dateKey(day);
            const today = key === dateKey(new Date());
            return <article key={key} className={today ? "is-today" : ""}>
              <header><small>{day.toLocaleDateString(undefined, { weekday: "short" })}</small><strong>{day.getDate()}</strong></header>
              <div>{mealTypes.map((meal) => {
                const plan = data.plans.find((item) => item.mealDate === key && item.mealType === meal.value) ?? null;
                return <button key={meal.value} className={plan ? "meal-slot is-planned" : "meal-slot"} disabled={!data.canManage && !plan} onClick={() => data.canManage && setMealEditor({ date: key, type: meal.value, plan })}>
                  <span>{meal.emoji}</span><small>{meal.label}</small>
                  {plan ? <><strong>{plan.title}</strong>{plan.cookName && <em><ChefHat /> {plan.cookName}</em>}</> : <i><Plus /> Add</i>}
                </button>;
              })}</div>
            </article>;
          })}
        </div>}
      </section>

      <div className="meal-lower-grid">
        <section className="meal-library-card">
          <header><div><Utensils /><span><small>Cookbook</small><h2>Favourite meals &amp; recipes</h2></span></div>{data.canManage && <button onClick={() => setRecipeEditor("new")}><Plus /> Add recipe</button>}</header>
          <div className="meal-recipe-list">
            {data.recipes.map((recipe) => <article key={recipe.id}>
              <button className={recipe.favorite ? "recipe-favorite is-active" : "recipe-favorite"} disabled={!data.canManage} aria-label={recipe.favorite ? "Remove from favourites" : "Add to favourites"} onClick={() => void toggleFavorite(recipe)}><Star fill={recipe.favorite ? "currentColor" : "none"} /></button>
              <div><strong>{recipe.name}</strong><small>{recipe.description || `${recipe.ingredients.length} ingredients`}</small></div>
              <footer>
                <button onClick={() => void addIngredients(recipe)}><ShoppingBasket /> Add ingredients</button>
                {data.canManage && <button onClick={() => setRecipeEditor(recipe)}><Pencil /> Edit</button>}
              </footer>
            </article>)}
            {!data.recipes.length && <button className="meal-empty" disabled={!data.canManage} onClick={() => setRecipeEditor("new")}><CookingPot /><strong>Your family cookbook is empty.</strong><small>Add a favourite meal and its ingredients.</small></button>}
          </div>
        </section>

        <section className="meal-suggestions-card">
          <header><div><Lightbulb /><span><small>Family choice</small><h2>Meal ideas</h2></span></div><button onClick={() => setSuggesting(true)}><Plus /> Suggest</button></header>
          <div className="meal-suggestion-list">
            {data.suggestions.map((suggestion) => <article key={suggestion.id}>
              <div><span>{mealTypes.find((meal) => meal.value === suggestion.mealType)?.emoji}</span><p><strong>{suggestion.title}</strong><small>{suggestion.suggestedByName}{suggestion.notes ? ` · ${suggestion.notes}` : ""}</small></p></div>
              <button className={suggestion.votedByMe ? "is-voted" : ""} onClick={() => void toggleVote(suggestion)}><ThumbsUp fill={suggestion.votedByMe ? "currentColor" : "none"} /> {suggestion.votes}</button>
            </article>)}
            {!data.suggestions.length && <div className="meal-suggestions-empty"><Lightbulb /><strong>No meal ideas yet.</strong><small>Everyone in the household can suggest and vote.</small></div>}
          </div>
        </section>
      </div>

      {mealEditor && <MealPlanModal editor={mealEditor} recipes={data.recipes} members={members} householdId={householdId} demo={demo} onClose={() => setMealEditor(null)} onSaved={updatePlan} onDelete={removePlan} />}
      {recipeEditor && <RecipeModal recipe={recipeEditor === "new" ? null : recipeEditor} householdId={householdId} demo={demo} onClose={() => setRecipeEditor(null)} onSaved={updateRecipe} />}
      {suggesting && <SuggestionModal householdId={householdId} demo={demo} onClose={() => setSuggesting(false)} onSaved={(suggestion) => { onChange({ ...data, suggestions: [suggestion, ...data.suggestions] }); setSuggesting(false); }} />}
      {editingDietary && <DietaryModal value={data.dietaryNotes ?? ""} householdId={householdId} demo={demo} onClose={() => setEditingDietary(false)} onSaved={(dietaryNotes) => { onChange({ ...data, dietaryNotes }); setEditingDietary(false); }} />}
    </>
  );
}

function MealPlanModal({ editor, recipes, members, householdId, demo, onClose, onSaved, onDelete }: {
  editor: NonNullable<MealEditor>; recipes: MealRecipe[]; members: HouseholdMemberSummary[]; householdId: string; demo: boolean;
  onClose: () => void; onSaved: (plan: MealPlan) => void; onDelete: (plan: MealPlan) => Promise<void>;
}) {
  const [title, setTitle] = useState(editor.plan?.title ?? "");
  const [recipeId, setRecipeId] = useState(editor.plan?.recipeId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    const input: SaveMealPlanInput = { mealDate: String(form.get("mealDate")), mealType: String(form.get("mealType")) as MealType, title: title.trim(), recipeId: recipeId || null, cookUserId: String(form.get("cookUserId") || "") || null, notes: String(form.get("notes") || ""), reminderMinutes: form.get("reminderMinutes") ? Number(form.get("reminderMinutes")) : null };
    try {
      const saved = demo ? { id: editor.plan?.id ?? crypto.randomUUID(), recipeName: recipes.find((recipe) => recipe.id === input.recipeId)?.name ?? null, cookName: members.find((member) => member.userId === input.cookUserId)?.name ?? null, createdAt: editor.plan?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), ...input, recipeId: input.recipeId ?? null, cookUserId: input.cookUserId ?? null, notes: input.notes || null, reminderMinutes: input.reminderMinutes ?? null } : await api.saveMealPlan(householdId, input);
      onSaved(saved);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The meal could not be saved."); } finally { setBusy(false); }
  }
  return <MealModal title={editor.plan ? "Edit planned meal" : "Plan a meal"} eyebrow="Weekly menu" onClose={onClose}>
    <form onSubmit={submit}>
      <div className="meal-form-row"><label>Date<input type="date" name="mealDate" defaultValue={editor.date} required /></label><label>Meal<select name="mealType" defaultValue={editor.type}>{mealTypes.map((meal) => <option key={meal.value} value={meal.value}>{meal.label}</option>)}</select></label></div>
      <label>Saved recipe <small>Optional</small><select value={recipeId} onChange={(event) => { const id = event.target.value; setRecipeId(id); const recipe = recipes.find((item) => item.id === id); if (recipe) setTitle(recipe.name); }}><option value="">Choose a recipe or type a meal</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.favorite ? "★ " : ""}{recipe.name}</option>)}</select></label>
      <label>Meal name<input autoFocus required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you having?" /></label>
      <label>Who is cooking? <small>Optional</small><select name="cookUserId" defaultValue={editor.plan?.cookUserId ?? ""}><option value="">Anyone / decide later</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
      <label>Notes <small>Optional</small><textarea name="notes" maxLength={500} rows={3} defaultValue={editor.plan?.notes ?? ""} placeholder="Prep, sides, or anything to remember…" /></label>
      <label><span className="meal-label-icon"><BellRing /> Reminder</span><select name="reminderMinutes" defaultValue={editor.plan?.reminderMinutes ?? ""}><option value="">No reminder</option><option value="0">At mealtime</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label>
      {editor.plan?.reminderMinutes != null && <small className="meal-reminder-preview">Current reminder: {readableReminder(editor.plan.reminderMinutes)}</small>}
      {error && <p className="module-alert">{error}</p>}
      <footer>{editor.plan && <button type="button" className="meal-delete" disabled={busy} onClick={() => void onDelete(editor.plan!)}>Remove</button>}<span /><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save meal"}</button></footer>
    </form>
  </MealModal>;
}

function RecipeModal({ recipe, householdId, demo, onClose, onSaved }: { recipe: MealRecipe | null; householdId: string; demo: boolean; onClose: () => void; onSaved: (recipe: MealRecipe) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); const form = new FormData(event.currentTarget);
    const input: SaveMealRecipeInput = { name: String(form.get("name") || ""), description: String(form.get("description") || ""), ingredients: parseIngredients(String(form.get("ingredients") || "")), instructions: String(form.get("instructions") || ""), favorite: form.get("favorite") === "on" };
    try {
      const saved = demo ? { id: recipe?.id ?? crypto.randomUUID(), createdBy: recipe?.createdBy ?? "demo-user", createdAt: recipe?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), ...input, description: input.description || null, instructions: input.instructions || null, favorite: input.favorite === true } : recipe ? await api.updateMealRecipe(householdId, recipe.id, input) : await api.createMealRecipe(householdId, input);
      onSaved(saved);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The recipe could not be saved."); } finally { setBusy(false); }
  }
  return <MealModal title={recipe ? "Edit recipe" : "New family recipe"} eyebrow="Family cookbook" onClose={onClose}><form onSubmit={submit}>
    <label>Recipe name<input name="name" defaultValue={recipe?.name ?? ""} required autoFocus maxLength={120} /></label>
    <label>Short description <small>Optional</small><input name="description" defaultValue={recipe?.description ?? ""} maxLength={500} placeholder="A quick family favourite" /></label>
    <label>Ingredients<textarea name="ingredients" required rows={7} defaultValue={ingredientsText(recipe)} placeholder={"2 | tomatoes\n500 g | pasta\n1 | onion"} /><small>One ingredient per line: quantity | ingredient</small></label>
    <label>Instructions <small>Optional</small><textarea name="instructions" rows={5} maxLength={3000} defaultValue={recipe?.instructions ?? ""} /></label>
    <label className="meal-check"><input type="checkbox" name="favorite" defaultChecked={recipe?.favorite ?? false} /> Save as a household favourite</label>
    {error && <p className="module-alert">{error}</p>}<footer><span /><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy}>{busy ? "Saving…" : "Save recipe"}</button></footer>
  </form></MealModal>;
}

function SuggestionModal({ householdId, demo, onClose, onSaved }: { householdId: string; demo: boolean; onClose: () => void; onSaved: (suggestion: MealSuggestion) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); const form = new FormData(event.currentTarget); const input = { title: String(form.get("title") || ""), notes: String(form.get("notes") || ""), mealType: String(form.get("mealType") || "dinner") as MealType }; try { const saved = demo ? { id: crypto.randomUUID(), ...input, notes: input.notes || null, suggestedByUserId: "demo-user", suggestedByName: "Louisa", votes: 1, votedByMe: true, createdAt: new Date().toISOString() } : await api.createMealSuggestion(householdId, input); onSaved(saved); } catch (caught) { setError(caught instanceof Error ? caught.message : "The meal idea could not be shared."); } finally { setBusy(false); } }
  return <MealModal title="Suggest a meal" eyebrow="Family choice" onClose={onClose}><form onSubmit={submit}><label>Meal idea<input name="title" required autoFocus maxLength={120} placeholder="Taco Tuesday?" /></label><label>Best for<select name="mealType" defaultValue="dinner">{mealTypes.map((meal) => <option key={meal.value} value={meal.value}>{meal.label}</option>)}</select></label><label>Why this one? <small>Optional</small><textarea name="notes" rows={3} maxLength={300} /></label>{error && <p className="module-alert">{error}</p>}<footer><span /><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy}>{busy ? "Sharing…" : "Share idea"}</button></footer></form></MealModal>;
}

function DietaryModal({ value, householdId, demo, onClose, onSaved }: { value: string; householdId: string; demo: boolean; onClose: () => void; onSaved: (value: string | null) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); const dietaryNotes = String(new FormData(event.currentTarget).get("dietaryNotes") || "").trim(); try { const saved = demo ? { dietaryNotes: dietaryNotes || null } : await api.saveMealSettings(householdId, { dietaryNotes }); onSaved(saved.dietaryNotes); } catch (caught) { setError(caught instanceof Error ? caught.message : "Dietary notes could not be saved."); } finally { setBusy(false); } }
  return <MealModal title="Dietary notes & allergies" eyebrow="For safer family meals" onClose={onClose}><form onSubmit={submit}><label>Household notes<textarea name="dietaryNotes" autoFocus rows={8} maxLength={1000} defaultValue={value} placeholder="Allergies, intolerances, preferences, or foods to avoid…" /><small>Visible to everyone who can see the meal planner.</small></label>{error && <p className="module-alert">{error}</p>}<footer><span /><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy}>{busy ? "Saving…" : "Save notes"}</button></footer></form></MealModal>;
}

function MealModal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop meal-modal-backdrop"><section className="meal-modal" role="dialog" aria-modal="true" aria-label={title}><header><div><span>{eyebrow}</span><h2>{title}</h2></div><button aria-label="Close" onClick={onClose}><X /></button></header>{children}</section></div>;
}
