/** Paprastas klasifikatorius pagal pavadinimą, nereikalaujantis DB migracijos. */
export const CATEGORIES = [
  { id: "all", label: "Visos prekės" },
  { id: "dairy", label: "Pieno produktai" },
  { id: "meat", label: "Mėsa ir žuvis" },
  { id: "produce", label: "Vaisiai ir daržovės" },
  { id: "bakery", label: "Duona ir kepiniai" },
  { id: "drinks", label: "Gėrimai" },
  { id: "pantry", label: "Bakalėja" },
  { id: "sweets", label: "Saldumynai ir užkandžiai" },
  { id: "frozen", label: "Šaldyti produktai" },
  { id: "home", label: "Buitis ir higiena" },
  { id: "other", label: "Kitos prekės" },
] as const;

export type CategoryId = typeof CATEGORIES[number]["id"];

const rules: Array<[Exclude<CategoryId, "all" | "other">, RegExp]> = [
  ["frozen", /\\b(šaldyt|saldyt|ledai|ledų|ledu|šerbet|serbet|šaldiklyje)\\b/i],
  ["home", /\\b(skalbik|valikl|šampūn|sampun|muil|dantų|dantu|sauskel|tualetin|servetėl|servetel|indų plov|indu plov|dezodor|higienin|popierin|šiukšlių|siuksliu)\\b/i],
  ["dairy", /\\b(pienas|pieno|jogurt|varšk|varsk|sūris|suris|sūrio|surio|grietin|kefyr|sviest|pasuk|grūdėt|grudet)\\b/i],
  ["meat", /\\b(vištien|vistien|kalakut|kiaulien|jautien|veršien|versien|dešr|desr|kump|farš|fars|žuvis|zuvis|žuvų|zuvu|lašiš|lasis|tun|krevet|silk|skumbr|filė|file|bekon|šoninė|sonine|mėsos|mesos)\\b/i],
  ["produce", /\\b(obuol|banan|apelsin|mandarin|citrin|kriauš|kriaus|brašk|brask|aviet|mėlyn|melyn|vynuog|bulv|pomidor|agurk|mork|svogūn|svogun|kopūst|kopust|salot|paprik|brokol|česnak|cesnak|avokad|arbūz|arbuz|melion|gryb|ridik)\\b/i],
  ["bakery", /\\b(duona|batonas|bandel|pyrag|kruasan|ragelis|tortilij|lavaš|lavas|keksiuk|sausainiai duon|skrebut|riestain)\\b/i],
  ["drinks", /\\b(vanduo|vandens|sultys|sulčių|sulciu|limonad|gėrimas|gerimas|kava|kavos|arbata|arbatos|energin|nektar|gira|sirupas)\\b/i],
  ["sweets", /\\b(šokolad|sokolad|saldain|sausain|vafl|traškuč|traskuc|riešut|riesut|guminuk|užkand|uzkand|kreker|čips|cips|karamel)\\b/i],
  ["pantry", /\\b(makaron|ryž|ryz|grik|aviž|aviz|milt|cukr|drusk|aliej|padaž|padaz|konserv|kruop|dribs|kečup|kecup|majonez|prieskon|actas|pupel|žirn|zirn|medus|uogien)\\b/i],
];

export function getCategory(name: string): CategoryId {
  for (const [id, regex] of rules) if (regex.test(name)) return id;
  return "other";
}
