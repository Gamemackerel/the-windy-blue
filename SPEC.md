# WATERWORLD (working title) — Game Spec

A silent, third-person sailing mystery for the browser. A drowned world, a handful of strange places, almost nobody left, and one enormous thing in the atoll.

Touchstones: the open-sea wonder of *Wind Waker*, the wordless mechanical puzzles of *Myst*, the rusted flotsam world of *Waterworld*. These are references for feeling only. All places, characters, art and puzzles are original.

## 0. Scope

This spec describes a **demo**: a compact, complete slice of the game, about 60–90 minutes for a first playthrough. It is a start, not a long-form game. Every location exists once, every puzzle is small, and nothing is padded. The sealed tower and the open questions at the end are where a larger game would grow from.

---

## 1. Pillars

1. **Silence.** No dialogue, no quest log, no HUD, and no text except the laboratory journals. Everything is communicated by staging, light, sound and the character's body language.
2. **Scale and dread.** Small boat, big sea, bigger things. The windmill, the tower and the giant should each make the player feel tiny in a different way.
3. **A curated palette.** Slate, bone, rust, black and deep blue. Green is almost absent, so that when it appears it is an event.
4. **Sailing that feels right.** Real points of sail and real wind, but forgiving. Trimming well should feel good within five minutes.
5. **The world remembers.** Things the player does stay done: the boat's scars, the lit laboratory, the giant's corpse.

## 2. Player experience

- **Perspective:** third person, orbit camera. On foot it sits close over the shoulder; on the boat it pulls back and lower to the water; in places of scale it widens further (windmill exterior, atoll, tower).
- **Session length:** 60–90 minutes for a first playthrough. No fail state other than losing the boat (see 6.4).
- **Structure:** open. After the boat is built, every location can be visited in any order. Progress is gated by items, not by walls.
- **Saving:** automatic and invisible (browser local storage), every few seconds and on mooring.

### 2.1 Controls

| Action | Keyboard / mouse |
|---|---|
| Move / steer tiller | WASD (A/D on boat) |
| Camera | Mouse |
| Sheet in / ease out | W / S on boat |
| Interact / take / moor | E |
| Offer held item | Hold E facing a person |
| Open satchel | Tab |
| Aim / fire (revolver only) | RMB / LMB |
| Run, climb faster | Shift |

Keyboard and mouse only for now. Input goes through an action map so gamepad can be added later. Touch is out of scope.

### 2.2 Interface rules

- No text anywhere in the game world or UI, with two exceptions: the laboratory journals (4.4.1) and a minimal pause menu (Esc), which lists the controls and holds quality, sound and new-game settings. A faint "ESC" appears for a few seconds on a first run so the menu can be found.
- **Satchel:** the character opens a bag; items are shown as physical objects in a shallow ring. No names, no descriptions.
- **Guidance:** the character's head and eyes turn toward things of interest. Interactable objects get no outline or icon; the character's hand lifts slightly when in reach.
- **Wind:** read from the masthead pennant, sail telltales, streaks on the water and the sound in the rigging.

## 3. Art direction

- **Target:** "AAA-minus" fidelity in a strongly art-directed style. Physically based materials and lighting, but simplified forms and controlled colour rather than photoreal clutter.
- **Palette:** desaturated slate sea, bone-white overcast, rust and oxidised steel, black basalt. The player wears a faded ochre oilskin so they always read against the sea.
- **Green rule:** green appears only in the jungle rig, the greenhouse, the laboratory specimens, and the rotting giant. Nowhere else, including UI and lighting.
- **Atmosphere:** heavy haze and long sight-lines. Landmarks (windmill, tower) are visible as silhouettes from most of the map and are how the player navigates.
- **Drama:** each location has one composed "reveal" view that the camera gently frames on first approach.
- **Night:** genuinely dark. Moonlight, stars, faint bioluminescence in the wake, and the few man-made lights that exist.

## 4. World

A square of open sea about 2.5 km on a side. At cruising speed (about 7 m/s) a full crossing takes 5–6 minutes, and most legs between neighbouring locations take 1–3. The edges fade into fog and a wind that turns the boat back.

| Location | Role |
|---|---|
| Starting island | Tutorial by exploration; build the boat |
| Greenhouse rig | Source of fruit |
| Jungle rig | Source of the orchid; the green set-piece |
| Houseboat | Crime scene; cigarettes; locked strongbox |
| Offshore windmill | The long climb; power puzzle |
| Glass laboratory | Parts for the windmill; the reveal of the drowned city |
| Atoll | The giant |
| Black tower | Sealed in v1 |

### 4.1 Starting island

A relatively large basalt island (roughly 300 m across, the biggest landmass in the demo): cliffs, dry grass the colour of straw, an abandoned boatyard in a sheltered cove, a few concrete buildings. One person lives here: **the Watcher**, who sits on a porch above the yard, smokes, and follows the player with their eyes.

**Boat puzzle.** An unfinished hull sits in a gated dry dock. Three things are needed, discoverable in any order:

1. **Mast.** A hand-cranked yard crane must be rebalanced (move counterweights to match a marking on the mast) and swung over the hull to step the mast.
2. **Sail.** The sail is in a locked loft whose lock is a glass eye above the door, on the shaded side of the building. A mirror on a post in the yard can be turned in steps; when it throws sunlight onto the eye, the door opens. It only works while the sun is up, which teaches the day/night cycle.
3. **Launch.** The dock floods through three sluice valves that must be opened in order. Each wheel has one, two or three pale marks above it, and they are not mounted in that order. A wrong wheel spins them all shut again. When the dock is full, the sea gate drops open.

The character rigs the boat in a short, unbroken animation and the game opens up.

### 4.2 Floating rigs and boats

- **Greenhouse rig.** A small steel platform carrying a glasshouse fogged with condensation. Inside, a handful of fruit and vegetables under grow-frames. Fruit can be taken and regrows each day.
- **Jungle rig.** A derelict platform completely overrun: vines pouring over the edges into the sea, birds, dripping water. The single most saturated place in the game. A climb through the canopy leads to one **orchid**.
- **Houseboat.** A small boat with a cabin built on it, drifting on a sea anchor. Inside: a dead man in a chair, an overturned table, dried blood, spent casings, a drawer of **cigarettes**, and a **strongbox** bolted under the bunk. The scene is readable but never explained.
- **The Fisher's skiff** and **the Smoker's barge** (see section 5).

### 4.3 Windmill

A modern offshore wind turbine, about 120 m to the hub, blades feathered and still. Entry is by a door at the base platform.

- **The climb** is the point. Internal ladders and caged stairs past numbered-by-symbol landings, with slot windows showing the sea falling away. About 3–4 minutes of real time, deliberately the longest uninterrupted stretch in the demo, with sound design carrying it (wind load, steel ticking, the player's breath).
- **Puzzle.** In the nacelle, two sockets are visibly empty: a **contactor block** and a **control card**, both found in the laboratory. With them installed the player must (1) release the rotor brake, (2) yaw the nacelle to face the wind using a hand wheel, reading wind direction from outside, and (3) unfeather the blades. Order matters and the machine responds physically to mistakes.
- **Payoff.** The blades begin to turn while the player is on top of the nacelle. From here every location in the game is visible.

### 4.4 Laboratory

A mostly glass structure below the surface near the windmill, entered by a surface pontoon and a hatch that is missing its **valve wheel**.

- **Unpowered:** dim red emergency lighting, black water pressing on the glass, shapes in tanks. The two windmill parts are taken from an open switch cabinet here.
- **Powered:** white light comes up room by room. The experiments are revealed: grown tissue, things in fluid, a tank holding something with the proportions of the giant but the size of a child. Exterior floodlights come on last, and through the walls the player sees fish, kelp, the nearby seafloor, and the broken towers of a drowned city.
- **Journals.** Handwritten research journals lie on desks through the lab. In the red emergency light they can be seen but not read; once the power is on the player can pick them up and read them (4.4.1).
- **Second bullet.** A cabinet with an electric lock opens once the power is on. Inside is a single round, the only other ammunition in the game.
- No people, alive or dead.

#### 4.4.1 The journals

The journals are the only words in the game. They deepen the mystery of the giant and answer nothing completely. There are six, found in any order, each a page or two of handwriting shown full-screen with no added interface. Pages are undated, some are water-damaged, and no names are given.

What they establish, in fragments:

- The giant came out of an **experiment** here. What the experiment was for is never stated.
- There was a **containment break**. The writers do not describe it directly, only what was different afterwards.
- It shows an **extraordinary intelligence and understanding**. The researchers come to suspect it is a greater kind of being than they are.
- It **tried to communicate** for a long time. They could not bridge the gap, and it eventually stopped trying.
- It seems **sad and lonely**. It has been observed staring at the stars for hours.
- Its **eyesight**, from their tests, is beyond anything they could measure.

Draft text (to be refined, kept this short):

1. *"Subject has outgrown the third tank. We have stopped pretending the growth curve means anything. Moving it to the sea pen tonight."*
2. *"We do not say 'the break' aloud. The pen was not forced. It was opened, from the inside, the way one opens a door one has been watching others use."*
3. *"It arranged the marker buoys again. Not a pattern we set. I have looked at the photograph for two days. I think it is a question, and I think it is a simple one, and I cannot read it."*
4. *"Acuity tests abandoned, we cannot build a target small enough or far enough. It followed a single gull from the horizon. I believe it sees us far better than we will ever see it."*
5. *"It no longer answers the lights. For a year it tried everything it had and we gave it back nothing it could use. I think it has concluded there is nobody here to talk to. I think it is right."*
6. *"Clear night. It has been at the surface since dusk with its face turned up, not moving. Four hours. I do not know what it sees up there. I know what it looks like, from here. It looks like someone waiting."*

### 4.5 Atoll

A near-circular reef about 400 m across with two or three navigable passes and a deep blue hole at the centre. See section 7.

### 4.6 Black tower

A windowless, seamless monolith rising from the sea, slightly reflective like obsidian, far taller than the windmill. An exterior stair winds partway up to a grand door with a pin pad of twelve unfamiliar glyphs.

In the demo the door **cannot be opened**. The pad accepts input and answers every attempt with the same low tone. Opening the tower belongs to a later release and is not designed here.

## 5. People and trading

There are very few people. They are still and quiet. They look at the player, shift their weight, cough, hum, smoke. They never speak, gesture instructions, or follow.

**Trading** is one interaction: the player holds an item out. The person looks at it. If they want it they take it, and after a moment put something down within reach. If not, they look away.

| Person | Where | Wants | Gives |
|---|---|---|---|
| The Fisher | Skiff near the jungle rig | Fruit | Brass key (opens the strongbox) |
| The Smoker | Barge between windmill and lab | Cigarettes | Valve wheel (opens the lab hatch) |
| The Watcher | House on the terrace above the yard | Orchid | Picture-chart showing the atoll passes |

The **chart** is a hand-drawn map with no words: the ring of the reef and the gaps a boat can sail through. It is a convenience, not a requirement.

### 5.2 Shooting people

The revolver can be fired at any person. This spends a round like any other shot.

- **Head or chest:** they die and fall as a full physical ragdoll, reacting to the surface they are on (slumping off a chair, sliding on a pitching deck, going over a rail into the water).
- **Arm, leg or belly:** they are knocked back a step by the impact, then crouch down holding the wound, breathing hard. They stay that way and no longer trade.
- **Their item:** anything a shot person would have traded falls beside them and can be picked up, so no item chain can be broken.
- **Persistence:** bodies and wounded people remain where they are for the rest of the save. Nobody else reacts; nobody else is close enough to see.

### 5.1 Item flow

```
Greenhouse fruit ─► Fisher ─► brass key ─► strongbox ─► REVOLVER (one round)
Houseboat cigarettes ─► Smoker ─► valve wheel ─► LAB (dark)
LAB parts ─► WINDMILL running ─► LAB (lit) ─► drowned city
LAB (lit) ─► powered cabinet ─► SECOND ROUND
Jungle orchid ─► Watcher ─► chart (optional; the passes can be found without it)
```

## 6. Sailing

### 6.1 Model

- A single-masted dinghy of about 5 m with one sail.
- Wind has a prevailing direction that drifts slowly over the day, with gusts visible as dark patches moving across the water.
- Boat speed comes from a polar curve by angle to the wind: a no-go zone of about 40° either side of the wind, fastest on a beam to broad reach.
- The player controls **tiller** and **sheet**. Correct trim gives a clear speed, sound and heel response.

### 6.2 Forgiveness

- Trim has a wide sweet spot, and a default assist eases the sail toward a reasonable setting if the player ignores it.
- The boat heels but never capsizes. In irons it drifts back and falls off the wind by itself.
- Tacks and gybes are one input; the character ducks the boom and changes sides.
- Shallow reef scrapes and slows the boat rather than sinking it.

### 6.3 Mooring

Approaching a cleat, ladder or beach slowly offers a moor action. The character drops sail and ties off. The boat stays where it is left.

### 6.4 Losing the boat

Only the giant can destroy the boat. The screen goes to black water; the player wakes on the starting island slip beside the hull, crudely patched. Inventory is kept. Patches accumulate visibly with each loss.

## 7. The giant

- **Emergence.** When the boat reaches the middle of the lagoon the water domes and a humanoid giant raises its head and shoulders out of the blue hole. The head alone is about 60 m tall. Water sheets off it for a long time.
- **Temperament.** Curious, idle, a little bored, like a cat with something small. It makes low sounds of amusement.
- **Behaviours:** watching; lowering its face to peer at the boat; a slow cupped-hand scoop that makes a wave; a flat slap near the boat; blowing on the sail; losing interest and sinking to its eyes. It is not trying to kill the player, but a direct hit or a large wave close by wrecks the boat.
- **At night.** Under a clear sky it is already at the surface, face turned up to the stars, motionless. It notices the boat late and with less interest than by day.
- **Leaving.** The player can simply sail out. It watches them go.

### 7.1 The shot

- The revolver is found with one round. A second round can be found in the powered laboratory (4.4). There are no others, and rounds can also be spent on people (5.2).
- Aiming is over the shoulder and sways with the boat. The eye is only a practical target when the giant peers.
- **Hit:** it makes one sound, slowly sags, and comes to rest leaning against the reef. That position never changes.
- **Miss:** the round is gone for good. If both rounds are spent without hitting the eye, the giant lives for the rest of that save.

### 7.2 Decay

Phases advance only while the player is away from the atoll, and each needs one dawn to pass, so both can be seen within a demo session.

| Phase | When | State |
|---|---|---|
| Fresh | The visit of the kill | Slumped on the reef, eyes open |
| Rot | Next visit, after at least one dawn | Bloated, sloughing, an oily slick on the lagoon, clouds of birds, flies audible from the pass. A sickly green |
| Bones | The visit after that, after another dawn | Clean skeleton in the same pose. The ribcage rises from the reef like a cathedral and can be sailed through |

## 8. Animation

Animation quality is a headline feature, not polish.

- **Approach:** all motion is procedural (see 9.5): gait cycles, IK and physics authored in code, with no motion-capture or hand-keyed clips.
- **Player on foot:** procedural gait with foot IK on uneven ground, weight shift on slopes and moving decks, leaning into wind, hand contact on rails and ladders, start/stop/turn transitions with no sliding.
- **Player on the boat:** full-body IK to tiller and sheet, hiking out against heel, ducking the boom, bracing in waves, stepping on and off at moorings.
- **Interaction:** every take, place, crank and offer is a reach to the real object position, not a canned clip at a fixed distance.
- **People:** long idle loops with layered procedural breathing, eye and head tracking, smoking. When shot: an impulse-driven stagger into a crouch, or a full ragdoll that blends out of the current pose with no pop (5.2).
- **Giant:** authored key poses driven by a behaviour state machine, with procedural arm and head IK toward the boat, slow secondary motion on skin and hair, and heavy follow-through so mass reads. Its hands displace the ocean (section 9.2).

## 9. Technology

### 9.1 Stack

- TypeScript, Vite, **Three.js on WebGL2**. WebGPU was the original intent; WebGL2 was chosen as the more dependable base and can be revisited.
- A small purpose-built collision system (boxes, ramps, cylinders, height fields) for walking and for the boat, and a Verlet ragdoll on the same joints the animation uses. No physics library.
- Web Audio with HRTF spatialisation.
- The whole world is generated at load and stays loaded; fixed parts are merged per material and neighbourhood to keep draw calls low.

### 9.2 Ocean

- Large swell is a sum of Gerstner waves evaluated identically on GPU (displacement) and CPU (buoyancy, character footing), so the boat sits exactly on the visible surface.
- Fine detail comes from an FFT or scrolling normal layer, GPU only.
- Local disturbances (boat wake, giant hands, the emergence dome) are injected into the same height function so they move the boat.
- Shading: refraction and depth absorption, subsurface scatter on wave crests, foam from wave steepness and around hulls, reflections from the sky plus screen-space reflections on higher tiers.

### 9.3 Lighting and post

- One sun or moon light with cascaded shadows; physically based sky with a full day/night cycle of about 20 minutes; moon phases.
- Height and distance fog as the main mood tool; low-resolution volumetric shafts on higher tiers.
- Underwater caustics and light shafts for the laboratory windows.
- Temporal anti-aliasing, restrained bloom, filmic tone mapping, a colour grade that shifts with time of day, light film grain.

### 9.4 Performance targets

| Tier | Example hardware | Target |
|---|---|---|
| High | Discrete GPU, Apple M-series Pro | 60 fps at 1440p |
| Medium | Apple M1, recent integrated graphics | 60 fps at 1080p with dynamic resolution |
| Low | Older integrated graphics, WebGL2 | 30 fps at 720p–900p |

- First playable (sea, starting cove) within 10 seconds on broadband. Because assets are generated in code, the download is small; the cost moves to generation time at load, which must be spread across frames or workers.
- Under 500 draw calls and 1.5 M triangles in view on Medium; instancing and impostors for anything repeated.
- Quality is auto-detected on first run and can be changed in the pause menu.

### 9.5 Assets

Every asset is generated in code as part of building the game. Nothing is commissioned, purchased or imported.

- **Geometry:** parametric and procedural meshes (terrain from noise and erosion, structures from kit-of-parts generators, vegetation from growth rules, characters and the giant from sculpted signed-distance or subdivision forms with a code-built skeleton).
- **Materials:** procedural shaders for rust, wet steel, basalt, glass, skin, cloth and foliage, with no painted textures.
- **Animation:** procedural, as in section 8.
- **Audio:** synthesised (wind, water, steel, voices and the giant) rather than recorded.

This shapes the look. Fidelity comes from light, water, atmosphere, material response and motion, with simplified, deliberate forms rather than photographic surface detail. Faces are kept at a distance, in shadow, or partly covered.

## 10. Audio

- No conventional score. Sparse tonal beds enter only at the reveals (first launch, windmill start, laboratory lights, giant emergence, the bones).
- The mix is wind, water, rigging, steel and footsteps, with a wide dynamic range.
- People make small human noises. The giant's voice is very low, close to felt rather than heard, with higher amused clicks and hums on top.
- The tower is acoustically dead: sound drops away near it.

## 11. Build order

1. **Sea and boat.** Ocean, sky, day/night, wind, sailing model, boat camera. This must be fun with nothing else in the game.
2. **Character.** Locomotion, IK, interaction reaches, boarding and mooring.
3. **Starting island.** Boat puzzle end to end, the Watcher, saving.
4. **Rigs and trading.** Greenhouse, jungle, houseboat, Fisher, Smoker, satchel, the item chain.
5. **Windmill and laboratory.** Climb, power puzzle, both lighting states, drowned city.
6. **Atoll and giant.** Emergence, behaviours, boat loss, the shot, three decay phases.
7. **Tower, audio pass, performance tiers, polish.**

## 12. Risks

- **Generated assets.** With everything made in code, human figures and their animation are the hardest things to make convincing. The character and one person should be prototyped early, and the style adjusted to what reads well.
- **The giant.** Scale, water interaction and animation quality all peak in one scene. Prototype it early at grey-box level.
- **Browser limits.** WebGPU coverage, memory ceilings on integrated graphics, and download size all push against the visual target.
- **Wordless puzzles.** Without text, puzzle readability can only be validated by watching people play.

## 13. Decisions

- **Assets:** all generated in code (9.5).
- **Tower:** sealed in the demo; opening it is a later release.
- **Ammunition:** two rounds in total; a miss is permanent (7.1). People can be shot (5.2).
- **Chart:** kept as the optional reward for the orchid trade.
- **Journals:** the only text in the game, readable once the lab is powered (4.4.1).
- **Ending:** none. The demo continues for as long as the player wants.
- **Input:** keyboard and mouse. Gamepad later; no touch.

## 14. Build status

Everything in this spec is implemented and playable from start to finish. An automated playthrough (`node scripts/flow.mjs`, with the dev server running) drives the whole chain and reports each step.

Known gaps against the spec, in rough order of how much they matter:

- **Character fidelity.** People now have continuous limbs and trunks swept along their joints, sculpted heads with faces, fingered hands, boots, hoods, hats, hair and worn details. They are still stylised rather than photoreal, and there is no cloth simulation.
- **Mooring and boarding are instant.** There is no stepping-aboard or tying-off animation; the boat glides to its berth and the sailor is placed on the dock.
- **The satchel** shows the carried items in an arc but the character does not physically open a bag.
- **Water.** Opaque, with analytic sky reflection, sun glitter, foam, shallows, surf and a wake. No refraction or reflections of objects.
- **Rendering.** In: surface relief on every material, wide sun and moon shadows, ambient occlusion, height-and-distance haze that glows toward the light, light shafts, bloom, filmic tone mapping with a grade, vignette and grain, eye adaptation at night and indoors. Not in: temporal anti-aliasing, reflections of objects in each other, global illumination.
- **Sound** is fully synthesised and has not been mixed by ear on real speakers.
- **Performance tiers** exist (Low / Medium / High, with automatic step-down on a first run). On the development machine at 1280x720, High measured roughly 40-50 frames a second and Medium about 95 with the frame cap removed; nothing else has been measured.
