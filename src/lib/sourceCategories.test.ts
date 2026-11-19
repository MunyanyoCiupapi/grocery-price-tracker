import assert from "node:assert/strict";
import test from "node:test";
import { ikiRootCategory, ikiSourceCategory, sourceCategory, type IkiCategory } from "./sourceCategories";

test("kategorijos parenkamos pagal parduotuvės surinkimo failą", () => {
    // Seni IKI failų pavadinimai nėra patikimi: kategorijos ID buvo pervadinti.
    assert.equal(sourceCategory("IKI", "iki_pieno_produktai_ir_kiausiniai.json"), undefined);
    assert.equal(sourceCategory("RIMI", "rimi_mesa-ir-zuvis.json"), "mesa");
    assert.equal(sourceCategory("MAXIMA", "barbora_bakaleja.json"), "bakaleja");
    assert.equal(sourceCategory("RIMI", "rimi_vaisiai-darzoves-ir-geles.json"), "vaisiai");
});

test("IKI kategorija nustatoma pagal šaltinio hierarchiją, o ne prekės pavadinimą", () => {
    const entries: IkiCategory[] = [
        { id: "dairy", parentId: "0", name: { lt: "Pieno produktai ir kiaušiniai" } },
        { id: "yogurt", parentId: "dairy", name: { lt: "Jogurtas" } },
        { id: "plain", parentId: "yogurt", name: { lt: "Natūralus jogurtas" } },
        { id: "pets", parentId: "0", name: { lt: "Gyvūnų prekės" } },
        { id: "food", parentId: "pets", name: { lt: "Kačių ėdalas" } },
    ];
    const categories = new Map(entries.map((entry) => [entry.id, entry]));
    assert.equal(ikiRootCategory("plain", categories)?.id, "dairy");
    assert.equal(ikiSourceCategory("plain", categories), "pieno");
    assert.equal(ikiSourceCategory("food", categories), "namai");
    assert.equal(ikiSourceCategory("missing", categories), undefined);
});

test("nutrūkusi ar ciklinė IKI hierarchija nespėjama", () => {
    const categories = new Map<string, IkiCategory>([
        ["a", { id: "a", parentId: "b" }],
        ["b", { id: "b", parentId: "a" }],
        ["missing", { id: "missing", parentId: "unknown" }],
    ]);
    assert.equal(ikiSourceCategory("a", categories), undefined);
    assert.equal(ikiSourceCategory("missing", categories), undefined);
});

test("nežinomų kategorijų ir Lidl bendro failo nepriskiria spėliodamas", () => {
    assert.equal(sourceCategory("IKI", "iki_nekategorizuota_1.json"), undefined);
    assert.equal(sourceCategory("LIDL", "lidl_visi.json"), undefined);
    assert.equal(sourceCategory("MAXIMA", "barbora_namai-ir-laisvalaikis.json"), "namai");
});
