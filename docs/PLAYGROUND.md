# Playground — "bump into your circle"

**Owner:** Pranav (Circle) · **Added:** Sep 26, wave 4 · **Status:** v1 shipped as the **Play** view on Your Circle (`apps/mobile/src/features/circle/BumpPlayground.tsx`).

The idea from Sahith: something playful and simple from your own graph — drag your node around and bump into your connections. Not a feature that does anything; a toy that makes the graph feel like *yours*.

## v1 (shipped)

- **Where:** Your Circle → the third toggle, **Play**, next to List and Map. Scrolling is off while it's showing so the drag isn't fighting the scroll view.
- **What you see:** you (the ember `0°` node) at the centre; every 1st-degree person on a ring around you, with the faint 2nd-degree ring beyond. Same layout as Map, so it reads as the same graph.
- **What you do:** drag yourself. When you overlap someone they get knocked away along the line between you, flash ember, and spring back home; your phone taps (light haptic); their name shows under the canvas with a running bump count. Let go and you spring back to the centre.
- **Tech:** `react-native-gesture-handler` Pan + `react-native-reanimated` (one shared value pair per friend via `makeMutable`, so the collision loop runs entirely on the UI thread); `expo-haptics` for the tap. Nothing is written anywhere — no server, no analytics.
- **Limits:** designed for the sizes a real circle has (a few to ~30 people). The collision check is O(n) per frame, fine at that scale.

## v2 ideas (not built — pick if there's time)

Ordered by fun-per-hour:

1. **Chain reactions.** When a friend gets knocked into someone *they* know (a `mutualEdges` pair), that person bounces too. Turns the mutual-friend lines into something you can feel.
2. **Drift.** Friends slowly float instead of sitting on a fixed ring; bumping sends them off at a velocity that decays. Needs a tiny per-frame integrator (`useFrameCallback`).
3. **Wave.** Bump someone three times and a "👋 from Sahith" notification lands on their phone — the first thing in the app that turns play into a nudge to hang out. Needs the notifications writer (still a known gap).
4. **Sound.** A soft pop per bump (`expo-audio`), respecting the silent switch.
5. **2nd degree, blurred.** Show the redacted 2nd-degree ring as unlabelled ghost nodes you can't reach until you've met them — the degrees rule, made tactile.
6. **Share a clip.** Record a few seconds of bumping as a GIF to send to the group chat.

## What to keep true

- It never reveals anyone past 1st degree by name (v2 #5 shows ghosts only).
- It never writes to the graph. "We met" stays an explicit action.
- It has to feel good on a real phone at 60fps; if the friend count ever gets large, cap the drawn nodes rather than dropping frames.
