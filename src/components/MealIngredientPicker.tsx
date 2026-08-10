import { useMemo, useState } from "react";
import { Check, ShoppingBasket, X } from "lucide-react";
import type { GroceryItem, MealIngredient, MealRecipe } from "../../shared/contracts";
import { api } from "../lib/api";

interface Props {
  recipe: MealRecipe;
  householdId: string;
  demo: boolean;
  onClose: () => void;
  onAdded: (items: GroceryItem[]) => void;
}

export function MealIngredientPicker({ recipe, householdId, demo, onClose, onAdded }: Props) {
  const keys = useMemo(() => recipe.ingredients.map((_, index) => index), [recipe.ingredients]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(keys));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function addSelected() {
    const ingredients = recipe.ingredients.filter((_, index) => selected.has(index));
    if (!ingredients.length) return;
    setBusy(true);
    setError(null);
    try {
      const items = demo
        ? ingredients.map((ingredient) => demoGrocery(ingredient))
        : await Promise.all(ingredients.map((ingredient) => api.createGroceryItem(householdId, { name: ingredient.name, quantity: ingredient.quantity })));
      onAdded(items);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ingredients could not be added to Groceries.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop meal-modal-backdrop">
    <section className="meal-modal meal-ingredient-picker" role="dialog" aria-modal="true" aria-label={`Add ${recipe.name} ingredients to Groceries`}>
      <header><div><span>Recipe → Groceries</span><h2>{recipe.name}</h2></div><button aria-label="Close ingredient picker" onClick={onClose}><X /></button></header>
      <div className="meal-ingredient-picker__intro"><ShoppingBasket /><div><strong>What do you still need?</strong><p>Select individual ingredients or add everything at once.</p></div></div>
      <div className="meal-ingredient-picker__actions"><button type="button" onClick={() => setSelected(new Set(keys))}>Select all</button><button type="button" onClick={() => setSelected(new Set())}>Clear</button></div>
      <div className="meal-ingredient-picker__list">{recipe.ingredients.map((ingredient, index) => {
        const checked = selected.has(index);
        return <button type="button" key={`${ingredient.name}-${index}`} className={checked ? "is-selected" : ""} onClick={() => toggle(index)}><span className="meal-ingredient-picker__check">{checked && <Check />}</span><span><strong>{ingredient.name}</strong><small>{ingredient.quantity}</small></span></button>;
      })}</div>
      {!recipe.ingredients.length && <p className="meal-ingredient-picker__empty">This recipe does not have any ingredients yet.</p>}
      {error && <p className="module-alert">{error}</p>}
      <footer><span /><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" disabled={busy || selected.size === 0} onClick={() => void addSelected()}><ShoppingBasket /> {busy ? "Adding…" : `Add ${selected.size || ""} to Groceries`}</button></footer>
    </section>
  </div>;
}

function demoGrocery(ingredient: MealIngredient): GroceryItem {
  return { id: crypto.randomUUID(), name: ingredient.name, quantity: ingredient.quantity, checked: false, important: false, createdAt: new Date().toISOString() };
}
