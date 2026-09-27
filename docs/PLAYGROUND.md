# Playground — the map you can push around

**Owner:** Pranav (Circle) · **Added:** Sep 26, wave 4 · **Changed:** Sep 26, wave 5 · **Status:** shipped as the **Map** view on Your Circle (`apps/mobile/src/features/circle/CircleGraph.tsx`).

The idea from Sahith: something playful and simple from your own graph — drag your node around and bump into your connections. Not a feature that does anything; a toy that makes the graph feel like *yours*.

## Wave 5: Play is the map

Wave 4 shipped a static SVG map and a separate **Play** toggle where only you moved. Testing said: "Play should be in map — not a separate thing — and make it more interactive with push and pull and see how connections interact." So there is one Map now, and it is physical:

- **Bodies.** You (ember `0°`) and every 1st-degree person are bodies in a small spring system that integrates every frame on the UI thread (`useFrameCallback`, one `makeMutable` set per body).
- **Springs are the edges.** You hang on a spring to the centre; each person hangs off you on a slack spring (the grey spokes). Two people who *also know each other* (`mutualEdges`) share a shorter, stiffer sage spring, so they cluster. Drag one and their mutual friend follows; the people they don't know get shoved out of the way. A stretched edge draws darker and thicker, so you can see the pull.
- **Everything repels a little**, so nobody overlaps, and a collision with real closing speed flashes both nodes ember and taps the phone (`expo-haptics`, throttled). If you were one of the two, the line under the map says who you bumped into and keeps count.
- **Drag anyone, not just yourself.** Fling them: release velocity carries (capped), damping brings it to rest, walls bounce. Tap a person to open their card (contact exchange lives there, wave 3).
- **Scrolling is off while the map shows**, so the drag isn't fighting the scroll view (List keeps pull-to-refresh).
- Nothing is written anywhere — no server, no analytics. "We met" stays an explicit action elsewhere.
- **Tuning knobs** are the constants at the top of `CircleGraph.tsx` (`K_SPOKE`, `K_MUTUAL`, `REPEL`, `DAMPING`, rest lengths). Designed for the sizes a real circle has (a few to ~30 people); the pair loop is O(n²) per frame, fine at that scale.

## v2 ideas (not built — pick if there's time)

Ordered by fun-per-hour:

1. **Chain reactions with sound.** A soft pop per bump (`expo-audio`), respecting the silent switch; a mutual-friend pair that gets bumped rings twice.
2. **Wave.** Bump someone three times and a "👋 from Sahith" notification lands on their phone — the first thing in the app that turns play into a nudge to hang out. The notifications writer exists now (wave 5, `apps/server/src/lib/notify.ts`), so this is a small route.
3. **2nd degree, blurred.** Show the redacted 2nd-degree ring as unlabelled ghost bodies you can't reach until you've met them — the degrees rule, made tactile.
4. **Pin.** Long-press to pin someone in place and rearrange the rest around them.
5. **Share a clip.** Record a few seconds of the map as a GIF to send to the group chat.

## What to keep true

- It never reveals anyone past 1st degree by name (v2 #3 shows ghosts only).
- It never writes to the graph.
- It has to feel good on a real phone at 60fps; if the friend count ever gets large, cap the drawn nodes rather than dropping frames.
