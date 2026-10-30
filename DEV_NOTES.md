# KockaSvijet — tehničke bilješke (za razvoj)

Voxel sandbox igra (klon u stilu Minecrafta, 100% originalni asseti — sve teksture/zvukovi/ikone se generišu proceduralno u kodu). Radi kao čisti file:// HTML — bez servera, bez interneta, bez modula (klasični <script> tagovi), bez Workera.

## Pokretanje
Dupli klik na `index.html` (Chrome/Edge). Ili `Pokreni igru.bat`.

## Struktura
- `index.html` — canvas + svi DOM ekrani (meniji, HUD, inventar...)
- `css/style.css` — stilovi menija/HUD-a
- `js/` redoslijed učitavanja: lang, util, blocks, sound, world, light, mesher, gl, physics, particles, entities, craft, save, player, renderer, ui, main

## Globalni namespace
Sve visi na `const KS = window.KS = {}`. Moduli dodaju svoje stvari.

## Konvencije / ključne konstante
- Chunk: 16×16, visina svijeta `WH = 96`, more `SEA = 30`. Bedrock y=0..2.
- Indeks u chunk nizu: `idx = (y<<8) | (lz<<4) | lx`; nizovi `Uint8Array(24576)`: `blocks`, `skyL`, `blkL`.
- Chunk koordinate: `cx = x>>4`, `lx = x&15` (radi i za negativne).
- Blok ID-evi: `KS.B.*` (1..89). Item ID-evi: `KS.I.*` (100+). Stack = `{id, n, dur?}`.
- `KS.blocks[id]` = {name(ključ za lang), solid, opaque, cross, liquid, light(0-15), hard(sekunde golom rukom), tool('pick'|'axe'|'shovel'|null), tier(potreban nivo za drop: 0 ruka/drvo,1 kamen,2 željezo), drop(id|fn|null), tex:{top,bot,side,front?} ili tex:broj, tint, group}
- Atlas blokova: 16×16 pločica po 16px = 256×256 canvas; `KS.atlas.tileUV(t)` → [u,v] u pikselima. Item ikone: drugi atlas `KS.itemAtlas` + dataURL za DOM (`KS.iconURL(id)`).
- Svjetlo: 2 kanala (sky, block), BFS propagacija, inkrementalno na izmjene. Chunk se osvjetljava tek kad postoji teren svih 8 susjeda (`lightReady`), mesh tek kad je osvijetljen on + susjedi.
- Mesher: culled faces + AO (0fps metoda) + smooth light (prosjek 4 ćelije po vertexu). Vertex format (16 bajta): pos uint16×3 (×256), uv uint16×2 (norm ×4096), sky|blk u 1 bajt, shade(ao×dirShade ×255) 1 bajt, tint RGB 3 bajta + 1 pad. Indeksi Uint32.
- Voda: top površina spuštena na 14/16, poseban prozirni mesh/pass. Lava = liquid, light 15, šteta na dodir.
- Cross blokovi (cvijeće, trava, baklja): 2 dijagonalna quada, obje strane.
- Fizika: AABB po osi (y,x,z), igrač 0.6×1.8, oko 1.62. Raycast: DDA (Amanatides-Woo), domet 4.5 (5.5 creative).
- Dan: `time` ∈ [0,1), 0=zora, 0.25=podne, 0.5=zalazak, 0.75=ponoć. Dan traje 600s. `sunH = sin(time*2π)`, `skyFactor = clamp((sunH+0.22)*2.6, 0.05, 1)`.
- Spremanje: localStorage. Ključevi: `ks_opts`, `ks_profile`, `ks_worlds` (lista meta), `ks_w_<id>` (meta+player+blockEntities), `ks_w_<id>_c_<cx>_<cz>` (RLE+base64 blokova). Mob entiteti se NE spremaju (osim item dropova ne — ništa), block entiteti (peć/kovčeg) se spremaju u meta JSON.
- Block entiteti: `world.blockEnts` Map "x,y,z" → {type:'furnace'|'chest', slots...}.
- Jezik: `KS.t('kljuc')`, bs (default) + en, `KS.lang`.
- Zvuk: WebAudio, sve sintetizovano. `KS.snd.play(name, {pos, pitch, vol})`, muzika generativna pentatonika.
- Likovi: 6 skinova, proceduralno crtani na 64×64 canvas; humanoid model (glava/tijelo/ruke/noge box-evi). `KS.chars`.
- Modovi: 'survival' | 'creative'. Težina: 'peace' | 'normal'.
- Testne kuke: `window.KS` sve izlaže; `KS.game` je aktivna igra.

## Bitne lekcije iz razvoja (v1.0)
- Petlja: rAF + watchdog `setInterval` (125ms) jer rAF ne radi u sakrivenom tabu; `tick(t)` čuva `lastTickAt`.
- Pointer lock se u nekim okruženjima sam otpusti → `pointerlockchange` otvara pauzu (to je željeno ponašanje, kao alt-tab).
- Treće lice: `back = persp===1 ? 1 : -1`; model entiteta rotira se s `rotateY(e.yaw)`, model gleda prema +Z (front strana je na +Z); pivoti glave prase/krava su na +Z.
- Sve kocke modela/predmeta/pukotina moraju biti CCW gledano spolja (isto kao chunkovi) — inače back-face culling crta unutrašnjost (pukotine nevidljive, vrh glave pokazuje donju teksturu).
- Model shader: `shade > 1.5` nosi tintu sivih tekstura (+2 trava, +4 lišće) za predmete u ruci/na podu.
- Magla računa stvarnu udaljenost od kamere (`uCam` uniform u chunk i model shaderu), ne clip-space dužinu.
- Svjetlo: `lightChunk` sije BFS samo iz ćelija koje mogu nešto promijeniti (rub chunka ili tamniji vodoravni susjed) — ~5× brže, isti rezultat. Ispod lišća/vode kolona drži konstantan nivo, pa `unpropagate` gasi i ćeliju ispod s istim nivoom.
- Oblaci: šum po svjetskoj ćeliji, mreža se gradi iznova kad kamera pređe u drugu ćeliju (14 blokova) — ne smiju se centrirati dvaput.
- Daleki chunkovi se izbacuju na početku `streamChunks` (prije posla s budžetom); izmijenjen chunk se ne izbacuje ako spremanje ne uspije.
- Noć: `C.dayLight = max(dayF, 0.24)` ide u uDay/lightAt za render; sirovi `dayF` ostaje za logiku (spawn zombija <0.28).
- Kriva svjetla u shaderu: `l*l*0.82 + l*0.16 + 0.035`.
- NIKAD ne uređivati JS fajlove PowerShell regexom (mojibake UTF-8) — koristiti Edit tool.
- Test okruženje: preview tab je "hidden" → `preview_screenshot` ne radi; canvas se hvata kroz `preview_eval` → `toDataURL` → base64 → dekodiranje u fajl + Read.

## Šta je svjesno pojednostavljeno
- Voda/lava statične (ne teku). Nema redstone, krevet, vrata, stepenice/ploče, farming, XP, oklop, luk, Nether/End, multiplayer.
- Čunkovi se generišu/meshaju amortizovano na glavnoj niti (file:// ne da Workere).

## Recepti (custom, vidljivi u igri u "Knjiga recepata")
balvan→4 daske; 2 daske→4 štapa; 2×2 daske→sto; 8 kamenčuga prsten→peć; 8 dasaka prsten→kovčeg; alati klasično (3 materijala + 2 štapa); ugalj+štap→4 baklje; 4 kamena 2×2→4 kamene cigle; TNT: pijesak/ugalj šah 3×3 (5 pijeska + 4 uglja). Topljenje: pijesak→staklo, kamenčuga→kamen, željezna/zlatna ruda→ingot, balvan→ugalj, sirovo meso→pečeno.
