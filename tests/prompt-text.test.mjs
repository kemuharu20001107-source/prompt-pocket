import test from "node:test";
import assert from "node:assert/strict";
import {
  tokenize, stripWeight, formatWeight, isValidWeight, renderSelection,
  hydrateDraft, addSelection, removeSelection, setSelectionWeight,
  moveSelection, editText, parseBulk
} from "../web/prompt-text.js";

const item = (prompt, key = prompt) => ({ key, itemId: key, label: key, prompt, weight: 1 });
const empty = () => ({ text: "", selections: [] });

test("top-level comma parsing preserves nested commas and escaped punctuation", () => {
  assert.deepEqual(tokenize("a, (b, c:1.2), [d, e], f").map((part) => part.text),
    ["a", "(b, c:1.2)", "[d, e]", "f"]);
  assert.deepEqual(tokenize("a\\,b, c").map((part) => part.text), ["a\\,b", "c"]);
});

test("weight validation accepts positive finite numbers up to ten", () => {
  for (const value of [.001, .8, 1, 1.5, 10]) assert.ok(isValidWeight(value));
  for (const value of [0, -1, 10.1, NaN, Infinity, "1.2", null]) assert.ok(!isValidWeight(value));
});

test("small positive weights retain precision instead of becoming zero", () => {
  assert.equal(formatWeight(.001), "0.001");
  assert.equal(formatWeight(1e-7), "0.0000001");
  assert.equal(formatWeight(1.2), "1.2");
  assert.equal(formatWeight(1), "1");
  assert.throws(() => formatWeight(0), RangeError);
});

test("multiword dictionary items are weighted and removed as a single owned selection", () => {
  let draft = addSelection(empty(), item("1girl, solo"));
  draft = setSelectionWeight(draft, "1girl, solo", 1.2);
  assert.equal(draft.text, "(1girl, solo:1.2)");
  assert.equal(draft.selections.length, 1);
  draft = removeSelection(draft, "1girl, solo");
  assert.deepEqual(draft, empty());
});

test("a selected duplicate never takes over an earlier handwritten occurrence", () => {
  let draft = addSelection({ text: "sunset", selections: [] }, item("sunset", "owned"));
  draft = setSelectionWeight(draft, "owned", 1.2);
  assert.equal(draft.text, "sunset, (sunset:1.2)");
  draft = removeSelection(draft, "owned");
  assert.equal(draft.text, "sunset");
  assert.equal(draft.selections.length, 0);
});

test("beforeinput insertion shifts ownership past an identical manual prefix", () => {
  let draft = addSelection(empty(), item("sunset", "owned"));
  draft = editText(draft, "sunset, sunset", { start: 0, end: 0, insertedText: "sunset, " });
  assert.deepEqual(draft.selections[0].span, { start: 8, end: 14 });
  draft = setSelectionWeight(draft, "owned", 1.2);
  assert.equal(draft.text, "sunset, (sunset:1.2)");
});

test("deleting the owned first duplicate cannot attach it to the remaining handwritten duplicate", () => {
  let draft = addSelection(empty(), item("sunset", "owned"));
  draft = editText(draft, "sunset, sunset", { start: 6, end: 6, insertedText: ", sunset" });
  draft = editText(draft, "sunset", { start: 0, end: 8, insertedText: "" });
  assert.equal(draft.text, "sunset");
  assert.equal(draft.selections.length, 0);
});

test("deleting an owned trailing duplicate leaves the handwritten text and deselects the item", () => {
  let draft = addSelection({ text: "sunset", selections: [] }, item("sunset", "owned"));
  draft = editText(draft, "sunset", { start: 6, end: 14, insertedText: "" });
  assert.equal(draft.text, "sunset");
  assert.equal(draft.selections.length, 0);
});

test("manual weight edits synchronize metadata and later edits do not nest numeric wrappers", () => {
  let draft = addSelection(empty(), item("long hair"));
  draft = editText(draft, "(long hair:1.2), sunset");
  assert.equal(draft.selections.length, 1);
  assert.equal(draft.selections[0].weight, 1.2);
  draft = setSelectionWeight(draft, "long hair", 1.3);
  assert.equal(draft.text, "(long hair:1.3), sunset");
  draft = setSelectionWeight(draft, "long hair", 1);
  assert.equal(draft.text, "long hair, sunset");
});

test("typing an incomplete wrapper one character at a time keeps the selection and manual following text", () => {
  let draft = addSelection(empty(), item("long hair"));
  draft = editText(draft, "long hair, sunset");
  for (const text of [
    "(long hair, sunset", "(long hair:, sunset", "(long hair:1, sunset",
    "(long hair:1., sunset", "(long hair:1.2, sunset", "(long hair:1.2), sunset"
  ]) {
    draft = editText(draft, text);
    assert.equal(draft.text, text);
    assert.equal(draft.selections.length, 1, text);
  }
  assert.equal(draft.selections[0].weight, 1.2);
  assert.deepEqual(draft.selections[0].span, { start: 0, end: 15 });
});

test("manual reordering synchronizes selection order before arrow movement", () => {
  let draft = addSelection(empty(), item("a", "A"));
  draft = addSelection(draft, item("b", "B"));
  draft = editText(draft, "b, sunset, a");
  assert.deepEqual(draft.selections.map((part) => part.key), ["B", "A"]);
  draft = moveSelection(draft, "A", -1);
  assert.equal(draft.text, "a, sunset, b");
  assert.deepEqual(draft.selections.map((part) => part.key), ["A", "B"]);
});

test("swapping selected spans preserves intervening handwritten duplicate text", () => {
  let draft = addSelection(empty(), item("a", "A"));
  draft = editText(draft, "a, a", { start: 1, end: 1, insertedText: ", a" });
  draft = addSelection(draft, item("b", "B"));
  draft = moveSelection(draft, "A", 1);
  assert.equal(draft.text, "b, a, a");
  assert.deepEqual(draft.selections.map((part) => part.key), ["B", "A"]);
  draft = removeSelection(draft, "A");
  assert.equal(draft.text, "b, a");
});

test("removing a middle item updates later span offsets without changing manual text", () => {
  let draft = addSelection({ text: "before", selections: [] }, item("long hair"));
  draft = addSelection(draft, item("blue eyes"));
  draft = removeSelection(draft, "long hair");
  assert.equal(draft.text, "before, blue eyes");
  assert.deepEqual(draft.selections[0].span, { start: 8, end: 17 });
});

test("legacy snapshots gain spans while exact text remains unchanged", () => {
  const old = { text: "1girl, solo, sunset", selections: [item("1girl, solo")] };
  const draft = hydrateDraft(old);
  assert.equal(draft.text, old.text);
  assert.deepEqual(draft.selections[0].span, { start: 0, end: 11 });
  assert.equal(old.selections[0].span, undefined);
});

test("a stale supplied span does not steal another matching occurrence", () => {
  const draft = hydrateDraft({
    text: "sunset, sunrise",
    selections: [{ ...item("sunset"), span: { start: 8, end: 15 } }]
  });
  assert.equal(draft.text, "sunset, sunrise");
  assert.equal(draft.selections.length, 0);
});

test("owned selections inside an unfinished manual bracket remain usable", () => {
  let draft = addSelection({ text: "(manual", selections: [] }, item("a"));
  assert.equal(hydrateDraft(draft).selections.length, 1);
  draft = setSelectionWeight(draft, "a", 1.2);
  assert.equal(draft.text, "(manual, (a:1.2)");
  draft = removeSelection(draft, "a");
  assert.equal(draft.text, "(manual");
});

test("numeric weights already stored in a dictionary prompt can be reset to one", () => {
  let draft = addSelection(empty(), item("(masterpiece:1.2)", "quality"));
  assert.equal(draft.text, "(masterpiece:1.2)");
  assert.equal(draft.selections[0].weight, 1.2);
  draft = setSelectionWeight(draft, "quality", 1);
  assert.equal(draft.text, "masterpiece");
  assert.equal(hydrateDraft(draft).selections[0].weight, 1);
  assert.equal(stripWeight("(masterpiece:1.2)"), "masterpiece");
  assert.equal(renderSelection({ prompt: "(masterpiece:1.2)", weight: 1.3 }), "(masterpiece:1.3)");
});

test("mutating the selected phrase deselects it without changing the user's text", () => {
  let draft = addSelection(empty(), item("long hair"));
  draft = editText(draft, "long hairx");
  assert.equal(draft.text, "long hairx");
  assert.equal(draft.selections.length, 0);
});

test("invalid weight changes leave valid text intact and arrows stay within bounds", () => {
  const original = addSelection(empty(), item("long hair"));
  assert.deepEqual(setSelectionWeight(original, "long hair", 0), original);
  assert.deepEqual(moveSelection(original, "long hair", -1), original);
  assert.deepEqual(moveSelection(original, "long hair", 1), original);
  assert.deepEqual(addSelection(original, item("long hair")), original);
});

test("bulk input supports blank lines and display-name tab prompt pairs", () => {
  assert.deepEqual(parseBulk("long hair\n\n短髪\tshort hair\n  \n\tponytail"), [
    { label: "long hair", prompt: "long hair" },
    { label: "短髪", prompt: "short hair" },
    { label: "ponytail", prompt: "ponytail" }
  ]);
});

test("adding after a line break still inserts a prompt separator", () => {
  const draft = addSelection({ text: "sunset\n", selections: [] }, item("long hair"));
  assert.equal(draft.text, "sunset,\nlong hair");
});

test("mixed edits retain ownership invariants and manual text over 250 operations", () => {
  let draft = { text: "handmade", selections: [] };
  for (let i = 0; i < 250; i++) {
    const op = i % 9;
    if (op === 0) draft = addSelection(draft, item("word " + i, "k" + i));
    else if (op === 1 && draft.selections.length) {
      draft = setSelectionWeight(draft, draft.selections[0].key, .001 + (i % 5));
    } else if (op === 2) {
      const prefix = "prefix " + i + ", ";
      draft = editText(draft, prefix + draft.text, { start: 0, end: 0, insertedText: prefix });
    } else if (op === 3 && draft.selections.length > 1) {
      draft = moveSelection(draft, draft.selections[0].key, 1);
    } else if (op === 4) {
      const suffix = ", manual " + i;
      draft = editText(draft, draft.text + suffix, {
        start: draft.text.length, end: draft.text.length, insertedText: suffix
      });
    } else if (op === 5 && draft.selections.length > 3) {
      draft = removeSelection(draft, draft.selections[1].key);
    } else if (op === 6 && draft.selections.length) {
      const selection = draft.selections[draft.selections.length - 1];
      const replacement = "(" + stripWeight(selection.prompt) + ":1.4)";
      draft = editText(draft, draft.text.slice(0, selection.span.start) + replacement +
        draft.text.slice(selection.span.end), {
          start: selection.span.start, end: selection.span.end, insertedText: replacement
        });
    } else if (op === 7 && draft.selections.length > 2) {
      draft = moveSelection(draft, draft.selections[1].key, -1);
    } else if (op === 8 && draft.selections.length > 6) {
      draft = removeSelection(draft, draft.selections[0].key);
    }
    assert.deepEqual(hydrateDraft(draft), draft, "hydration must not change a valid owned draft");
    assert.ok(draft.text.includes("handmade"), "manual text must remain");
    for (let j = 1; j < draft.selections.length; j++) {
      assert.ok(draft.selections[j - 1].span.end <= draft.selections[j].span.start);
    }
  }
});

test("separate item IDs with identical text retain independent ownership", () => {
  let draft = addSelection({ text: "sunset", selections: [] }, item("sunset", "A"));
  draft = addSelection(draft, item("sunset", "B"));
  assert.deepEqual(draft.selections.map((selection) => selection.span), [
    { start: 8, end: 14 }, { start: 16, end: 22 }
  ]);
  draft = setSelectionWeight(draft, "B", 1.2);
  assert.equal(draft.text, "sunset, sunset, (sunset:1.2)");
  draft = removeSelection(draft, "A");
  assert.equal(draft.text, "sunset, (sunset:1.2)");
  draft = setSelectionWeight(draft, "B", 1.3);
  assert.equal(draft.text, "sunset, (sunset:1.3)");
});

test("partial removal from a multiword dictionary item is never resurrected by later operations", () => {
  let draft = addSelection({ text: "manual", selections: [] }, item("1girl, solo", "M"));
  draft = editText(draft, "manual, 1girl");
  assert.equal(draft.selections.length, 0);
  draft = addSelection(draft, item("long hair", "H"));
  assert.equal(draft.text, "manual, 1girl, long hair");
  draft = setSelectionWeight(draft, "H", 1.2);
  assert.equal(draft.text, "manual, 1girl, (long hair:1.2)");
});

test("changing a preweighted dictionary item replaces its numeric wrapper", () => {
  const draft = setSelectionWeight(addSelection(empty(), item("(foo:1.2)", "F")), "F", 1.3);
  assert.equal(draft.text, "(foo:1.3)");
});
