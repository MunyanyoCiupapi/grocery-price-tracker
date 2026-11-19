This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Kategorijų duomenys

Kategorijos priskiriamos pagal surinkimo šaltinio kategorijas. IKI kategorijų
hierarchija atnaujinama iš „LastMile“, o „Rimi“ ir „Barboros“ – pagal jų
surinkimui naudojamų kategorijų failus. Prekės be patikimos kategorijos lieka
„Kitos ir nesuskirstytos“; `Lidl` bendras failas kategorijų neturi.

Prieš naudojant naują kategorijų filtrą esamoje duomenų bazėje, vieną kartą
reikia pritaikyti migraciją ir įrašyti kategorijas iš turimų JSON failų:

```bash
npx tsx src/scrapers/sync-db.ts --categories-only --migrate-categories
```

Ši komanda pakeičia duomenų bazės schemą ir kategorijų duomenis, bet neatnaujina
kainų ir neperskaičiuoja prekių grupių. IKI failus prieš tai galima atnaujinti
komanda `npx tsx src/scrapers/iki.ts`. Surinkėjas prašo visų puslapių ir lygina
rezultatą su šaltinio nurodytu skaičiumi. Jei trūksta prekių, jis grąžina
klaidos kodą, kad automatinis darbas netrintų senų prekių.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
