# KockaSvijet ⛏

3D igra gradnje i preživljavanja od kockica — kompletna voxel sandbox igra u čistom JavaScriptu i WebGL2, **bez ijednog vanjskog fajla**: sve teksture, zvukovi i muzika se generišu programski u toku igre.

**🎮 Igraj odmah: [kockasvijet.vercel.app](https://kockasvijet.vercel.app)**

## Šta ima u igri

- Glavni meni sa živom 3D panoramom, opcije, izbor 6 likova
- Beskrajan proceduralni svijet: ravnice, šume, pustinje, snijeg, planine, okeani
- Pećine, lava i rude (ugalj → željezo → zlato → dijamant)
- Preživljavanje: život, glad, davljenje, pad, noć i zombiji
- Kreativni mod: letenje, svi blokovi, trenutno kopanje
- Preko 50 vrsta blokova, crafting (2×2 i sto 3×3), peć, kovčezi, TNT
- Životinje (prasići i krave), dan/noć ciklus, sunce, mjesec, zvijezde, oblaci
- Čuvanje više svjetova (localStorage), automatski save
- Knjiga recepata u pauzi (Esc)

## Pokretanje

**Online:** otvori deploy link gore.
**Lokalno:** dupli klik na `index.html` (Chrome/Edge) — radi potpuno offline.

## Kontrole

| Tipka | Radnja |
|---|---|
| W A S D + miš | kretanje i gledanje |
| Lijevi klik (drži) | razbij blok / udari |
| Desni klik | postavi blok / koristi / jedi |
| Space | skok / plivanje |
| Shift | šunjanje |
| Ctrl ili 2×W | trčanje |
| E | inventar |
| Q | baci predmet |
| 1–9 / točkić | izbor police |
| F | kamera (1./3. lice) |
| F3 / F2 | debug / screenshot |
| Esc | pauza + knjiga recepata |
| 2× Space | letenje (kreativni mod) |

## Tehnički detalji

Vanilla JS + WebGL2, ~6.600 linija. Chunk sistem 16×16×96 sa BFS širenjem svjetla (nebo + baklje), ambijentalna okluzija, glatko osvjetljenje, proceduralne teksture na canvas atlasu, WebAudio sinteza zvuka i generativna muzika. Detalji arhitekture: [DEV_NOTES.md](DEV_NOTES.md).

## Napomena

Fan projekat napravljen iz ljubavi prema igrama gradnje — sav kod, grafika i zvuk su originalni. Nije povezan ni sa jednom kompanijom niti igrom. Napravljeno uz [Claude](https://claude.com) (Anthropic).
