import assert from "node:assert/strict";
import test from "node:test";
import { clusterProducts } from "./matcher";

test("sujungia skirtingai aprašytus to paties dydžio Kinder Bueno batonėlius", () => {
    const result = clusterProducts([
        { id: "maxima", store: "MAXIMA", name: "Vaflinis batonėlis KINDER BUENO su šokoladu, 43 g" },
        { id: "iki", store: "IKI", name: "Šokoladinis batonėlis KINDER BUENO, 43 g" },
        { id: "rimi", store: "RIMI", name: "Vaflinis batonėlis KINDER BUENO, 43g" },
    ]);
    assert.equal(result.keys.get("maxima"), result.keys.get("iki"));
    assert.equal(result.keys.get("iki"), result.keys.get("rimi"));
});

test("nesujungia skirtingų Kinder Bueno rūšių, dydžių ar ledų", () => {
    const result = clusterProducts([
        { id: "regular", store: "IKI", name: "Šokoladinis batonėlis KINDER BUENO, 43 g" },
        { id: "white", store: "RIMI", name: "Vaflinis batonėlis KINDER BUENO WHITE, 43g" },
        { id: "large", store: "MAXIMA", name: "Vaflinis batonėlis KINDER BUENO, 129 g" },
        { id: "ice", store: "RIMI", name: "Valg. kūgin. ledai KINDER BUENO, 90 ml / 62 g" },
    ]);
    assert.equal(new Set(result.keys.values()).size, 4);
});

test("sujungia Kinder Bueno mini tik su tos pačios pakuotės mini batonėliais", () => {
    const result = clusterProducts([
        { id: "maxima", store: "MAXIMA", name: "Šokoladu padengti vafliniai saldainiai KINDER BUENO MINI, 108 g" },
        { id: "iki", store: "IKI", name: "Mini vafliniai batonėliai KINDER BUENO, 108 g" },
        { id: "rimi", store: "RIMI", name: "Vafliniai batonėliai KINDER BUENO MINI, 108g" },
    ]);
    assert.equal(new Set(result.keys.values()).size, 1);
});

test("ta pati aprašymo taisyklė veikia ir kitų ženklų saldumynams", () => {
    const result = clusterProducts([
        { id: "a", store: "MAXIMA", name: "Šokoladu padengti vafliniai saldainiai NESTLE LION, 42 g" },
        { id: "b", store: "IKI", name: "Vaflinis batonėlis NESTLE LION, 42 g" },
    ]);
    assert.equal(result.keys.get("a"), result.keys.get("b"));
});

test("skirtingi vandens skoniai nesujungiami per neapibrėžtą pavadinimą", () => {
    const result = clusterProducts([
        { id: "orange", store: "RIMI", name: "Gaz. apelsinų ar. stalo vanduo AKVILĖ, 1,5 l" },
        { id: "plain", store: "IKI", name: "Gazuotas stalo vanduo AKVILĖ, 1,5 l" },
        { id: "peach", store: "MAXIMA", name: "Lengvai gazuotas stalo vanduo su persikų skonio aromatu AKVILĖ, 1,5 l" },
    ]);
    assert.notEqual(result.keys.get("orange"), result.keys.get("peach"));
});

test("skirtingos produkto linijos ir skoniai nesujungiami", () => {
    const result = clusterProducts([
        { id: "lemon", store: "IKI", name: "Alaus kokteilis GARAGE HARD LEMON (4%), 500 ml" },
        { id: "orange", store: "MAXIMA", name: "Alaus kokteilis GARAGE HARDCORE, apelsinų skonio, 500 ml" },
    ]);
    assert.notEqual(result.keys.get("lemon"), result.keys.get("orange"));
});

test("skirtingų skonių tyrelės ir prekės be laktozės lieka atskirai", () => {
    const result = clusterProducts([
        { id: "mango", store: "RIMI", name: "Mango tyrelė SEMPER, 110 g" },
        { id: "raspberry", store: "MAXIMA", name: "Vaisinė tyrelė SEMPER su avietėmis, 110 g" },
        { id: "lactose_free", store: "RIMI", name: "Varškė GRAIKIŠKA AMFORA PROTEIN be laktozės su braškėmis, 0,8 %, 200 g" },
        { id: "regular", store: "IKI", name: "Varškė su braškėmis GRAIKIŠKA AMFORA PROTEIN, 0,8 %, 200 g" },
    ]);
    assert.notEqual(result.keys.get("mango"), result.keys.get("raspberry"));
    assert.notEqual(result.keys.get("lactose_free"), result.keys.get("regular"));
});
