# Memory Grid: What I Learned Building a Path-Following Game for Spectacles

When you build a game where people memorize a path on a floor grid and then walk it from memory, you run into a few things Spectacles don't give you for free: a clear view of the whole grid, reliable knowledge of where the player is standing, and a way to remember progress between sessions. This is the story of how I worked around those limits—and what I'd do differently next time.

**The project is open source:** [memory-grid on GitHub](https://github.com/yourusername/memory-grid). Clone it, open in Lens Studio, and explore.

---

## Where It Started

The Cube—a British game show I used to watch with my family a few years ago—stuck with me. One of its challenges was a memory path: contestants studied a sequence of tiles on the floor, then had to walk it from memory. The tension of watching someone hesitate, step wrong, and get eliminated made for great TV. I kept thinking it would translate well to AR: you're already in physical space, you're already moving. Why not put the grid on your floor?

*[Screenshot, video, or GIF from The Cube's memory path challenge would go here.]*

I didn't want to copy it exactly. The show's version was a single high-stakes round. I wanted something you could *live in*—with progression, variety, and room to improve. So I expanded it into 11 levels, path length increasing as you advance. I added directional arrows on each tile so players always know which way to go next. I tuned the reveal timing, the countdown, the feedback—everything from how the path appears to what happens when you step wrong. The result is a full game with its own rhythm and feel, but the core idea—memorize, then walk—still comes from that family living room and The Cube.

---

## You Can't See the Whole Grid—So Don't Show It

Spectacles have a tight field of view. A 5×5 grid of half-meter tiles spans more floor than you can comfortably take in at once. Early on, I tried revealing the full path in one go. Playtesters would stare at the grid, pan their head, miss tiles, then fail. The memorize phase felt like a race against a clock they couldn't win.

The fix was to stop competing with the FOV and work with it. Instead of showing everything at once, the path *reveals itself* tile by tile. The yellow start tile appears first—right where the player is looking after they place the grid. Then tile two, then three, each with a bounce animation and an arrow pointing to the next. The path draws itself from the player's perspective. They don't have to scan; they follow.

That only works if the start is where they expect it. The grid is placed with Snap's Surface Placement package—pinch to drop a tracker on the floor. The grid extends *away* from that point, and the path always starts on the near edge, the row closest to them. So the first thing they see after "go" is the yellow tile, front and center.

Paths use orthogonal moves only—up, down, left, right. No diagonals. It matches how people actually walk and keeps the flow readable. For the longest levels (23+ tiles on a near-full grid), random path generation kept painting into corners and failing. I switched to Warnsdorff's heuristic: when choosing the next step, prefer the neighbor with fewer unvisited neighbors. It's an old trick for avoiding dead ends, and it made the hard levels generate reliably.

*If you add visuals here:* a simple diagram of the progressive reveal (start → tile 2 → … → end), or screenshots from the countdown, memorize, and playing phases, would make this concrete.

---

## The Head Isn't the Feet—So Stop Pretending It Is

Spectacles track your head. They don't track your feet, your body, or your skeleton. For a walking game, that's a problem. The obvious approach: project the camera position straight down onto the floor and treat that as where the player is standing. Works fine on paper. In practice, it broke constantly.

People lean. They lean forward to look at a tile. They lean to the side. A typical lean moves your head 15–40 centimeters without your feet moving. In a 50 cm tile grid, a 25 cm lean is enough to shift the projected point from one tile into another. The game would trigger the wrong tile, or no tile, or two tiles in a row. Playtesters would step correctly and get "wrong step." Or they'd lean to read a tile and suddenly "complete" a step they never took.

I tried tightening the detection radius. I tried requiring a minimum distance moved before registering a new tile. I tried raycasting down from the camera. Same fundamental issue: everything was derived from head position, and head position lies when you lean.

The solution was to stop estimating and start measuring. Instead of projecting position and doing distance checks, I put a *trigger collider* at each tile center—a vertical plane, about 40 cm wide and 60 cm tall, thin in depth. I added a small collider to the camera. A tile activates only when the camera collider *enters* that trigger. Walking moves your head through space; the collider passes through the plane. Leaning rotates your head in place; the collider doesn't move far enough to cross into the next tile's narrow zone. Physics does the work. Overlap or no overlap—no guesswork.

There were a few gotchas. UI and buttons can have colliders too; if you're not careful, looking at a menu can trigger a tile. The trigger script checks that the overlapping collider belongs to the camera object itself, not a child. And each trigger needs to reset between rounds so it can fire again.

This pattern is built for grid-based layouts—tight, evenly spaced tiles. For open-world zones or sparse triggers, you'd use something else. But for this kind of game, it was the difference between frustrating and fun.

*If you add visuals here:* a side-view sketch of the trigger plane and camera collider, walking vs. leaning, would crystallize the idea.

---

## Achievements Aren't Built In—So I Built Them

Spectacles lenses don't ship with achievements. I wanted players to have milestones: completing levels, nailing a run without retries, or pushing through after multiple fails. So I built a small system on top of Lens Studio's persistent storage.

I store level progress, retry counts, and which levels were completed on the first try. Achievements fall into three buckets. *Progression* badges reward reaching levels 1, 3, 5, 8, and all 11. *Flawless* badges reward no retries—Level 1 clean, Levels 1–5 clean, or all 11 clean—plus a "deep focus" badge for any Level 6+ on first try. *Persistence* badges reward coming back: completing after exactly one retry, after three or more, or beating the final level with five or more total retries across the whole game. That last one—"Never Give Up"—is for the player who keeps failing and keeps trying.

The tricky part was timing. Badges like "Quick Learner" (complete after one retry) and "Comeback Kid" (complete after three) need to read the retry count *before* it gets reset on success. So the achievement check runs right after a level completes, before the counter clears. Multiple achievements can unlock in one go—for example, first_steps and clean_start when you nail Level 1 on the first try. I added a notification queue: popups show one at a time, with a short delay between each, so you're not spammed. I also added a fallback path: if the event subscription order gets weird (e.g. hot-reload during development), GameStateManager computes newly unlocked achievements by comparing before/after and enqueues them directly. Belt and suspenders.

Progress resets clear levels and retries, but achievements stay. Once you've unlocked something, it's yours. Feels right.

*If you add visuals here:* a screenshot of the achievement popup and the achievements screen would bring it home.

---

## In Retrospect

Memory Grid came together when I stopped fighting the hardware. The FOV is small—so the path reveals itself instead of demanding a panorama. Head tracking isn't foot tracking—so physics overlap replaces position projection. Achievements aren't native—so a thin layer on persistent storage plus a queue does the job. Each piece solves a real problem I hit while building; none of it was theoretical.

If you're working on a similar Spectacles experience—grid-based, step-based, or anything where "where am I standing?" matters—the collider approach is worth a look. The full project is on GitHub. Fork it, break it, make it yours.

---

# Shareable Snippets

## LinkedIn

**Option A (Technical / Problem-solving):**
> Building Spectacles AR games means working around head tracking—there's no foot or body position. For Memory Grid, a path-following game where players step on tiles, projecting head position to the floor caused false triggers when players leaned. Switched to collider-based triggers: vertical planes at each tile center, camera collider, overlap events. Walking = translation = trigger. Leaning = rotation = no trigger. Solved.
>
> Wrote up the full design: FOV optimization, path generation (Warnsdorff for long paths), and the achievement system. Link in comments. 🔗

**Option B (Story / Process):**
> Three things I learned building Memory Grid for Spectacles AR:
> 1. Progressive reveal beats full-grid reveal when FOV is limited
> 2. Collider-based tile detection beats position projection when players lean
> 3. A notification queue keeps achievement popups from overlapping
>
> Open-sourced the project and wrote a technical deep dive. Link below. 👇

**Option C (Achievement focus):**
> Spectacles lenses don't ship with achievements out of the box. For Memory Grid I added: persistent storage for progress, progression + flawless + persistence badges, and a popup queue for multiple unlocks. Learned a lot about Lens Studio's scripting model and event ordering.
>
> Full article (FOV design + collider detection + achievements) in the first comment. 📄

---

## Twitter / X

**Thread (3 tweets):**

> 1/ Built Memory Grid for Spectacles AR—a path-following game where you memorize then walk a route. Wrote up three technical areas: FOV design, collider-based tile detection, and achievements. Open-sourced it. 🧵
>
> 2/ Head tracking ≠ foot position. Projecting head to the floor caused false triggers when players leaned. Fix: vertical trigger colliders at each tile. Walking moves the camera into the trigger; leaning doesn't. Physics > estimation.
>
> 3/ Full article covers progressive reveal, Warnsdorff path generation, persistent storage, and a notification queue for achievements. Link: [your URL]

**Single tweet:**
> Built Memory Grid for Spectacles AR. Wrote about: FOV-optimized design (progressive reveal, start-anchored grid), collider-based tile detection (when head projection fails), and achievements in Lens Studio. Open source + article: [your URL]

**Achievement-only tweet:**
> Added 12 achievements to a Spectacles AR game: progression, flawless, and persistence badges. Persistent storage + notification queue for popups. Full technical notes: [your URL]
