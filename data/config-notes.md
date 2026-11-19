# The values' notes

What `prototypes/pang-pang-buddies/config.js` said beside its values, kept here because `data/config.json`
holds no comments. The values themselves are in `data/config.json`.

- `seed`: every gameplay random call reads rng(), seeded from this (or ?seed= in the address)

---- The ride: what the DJ does to the disc (the values that matter most) ----------------
- `pang_power`: m/s upward for a weight-1 animal at power 1
- `pang_kick`: m/s outward shove added by a pang
- `spin_r1`: rad/s, round 1's cruising spin
- `spin_r2`: rad/s, round 2
- `spin_r3`: rad/s, the finale
- `spin_accel`: rad/s^2, how fast the DJ changes speed
- `scratch_accel`: rad/s^2 while the record is scratched backwards
- `spin_push`: share of the spin's outward pull an animal feels
- `grip_stiffness`: 1/s, how firmly feet follow the floor (lower = more creep)
- `gravity`: m/s^2
- `tilt_angle`: degrees the disc leans
- `tilt_hold`: s a tilt is held
- `tilt_slide`: x gravity along the slope

---- The challenge: rounds and the DJ's ramp ---------------------------------------------
- `round_seconds`: s per round (one song)
- `rest_seconds`: s of rest between rounds
- `first_pang`: s into round 1: the gentle teaching pang
- `first_strong_pang`: s into round 1: the first real trouble
- `pang_gap_r1`: s between the DJ's moves, round 1
- `pang_gap_r2`: round 2
- `pang_gap_r3`: the finale
- `fake_chance_r2`: share of round-2 pangs that are fake-outs
- `fake_chance_r3`: the finale
- `gates_r3`: rail segments (of 8) that open in the finale
- `gate_warn`: s a segment blinks before it drops
- `spot_bonus`: x launch for the animal the DJ calls out
- `spot_warn`: s the spotlight shows before its pang

---- The limit: one gauge, drained while a skill is held ----------------------------------
- `gauge_regen`: gauge per second while resting
- `regen_delay`: s after release before it refills
- `tired_time`: s locked out after the gauge empties

---- Elephant (코코): holds the rail with the trunk, shelters whoever touches it ------------
- `ele_gauge`: s of trunk grip
- `trunk_reach`: m from elephant to rail
- `shelter_range`: m of gap that still counts as touching
- `shelter_cost`: extra drain per sheltered friend
- `ele_walk`: m/s
- `ele_traction`: m/s^2 of grip before it slides
- `ele_launch`: x pang power (heavy)

---- Bird (삐삐): flies briefly, carries the nearest friend -------------------------------
- `bird_gauge`: s of flight alone
- `fly_speed`: m/s
- `fly_height`: m above the disc
- `carry_reach`: m to pick a friend up
- `carry_cost_light`: x drain carrying the octopus or monkey
- `carry_cost_heavy`: x drain carrying the elephant
- `bird_launch`: light: thrown highest

---- Octopus (무너): suckers stick anywhere, walks slowly while stuck ----------------------
- `oct_gauge`: s of suction
- `suction_walk`: x walk speed while stuck
- `arm_reach`: m to hold one friend with an arm
- `arm_cost`: extra drain while holding a friend

---- Monkey (몽이): tail hooks a friend in danger, or the rail ----------------------------
- `mon_gauge`: s hanging on the rail by the tail
- `tail_range`: m to snatch a friend
- `tail_hook_range`: m to hook the rail
- `tail_cost`: gauge spent per snatch

---- Down, not out: hanging and rescue ----------------------------------------------------
- `hang_time`: s an animal dangles before it drops
- `hang_pang_loss`: s of hang time a pang shakes off
- `rescue_time`: s beside a hanging friend to pull it up
- `rescue_reach`: m from the friend's spot on the rim
- `saved_shield`: s nothing can throw an animal just pulled up
- `self_climb`: climb progress per skill-key tap while hanging (1 = back on)
- `bot_climb`: chance per step a hanging bot taps to climb

---- Stars to collect -----------------------------------------------------------------------
- `star_every`: s between new stars on the record
- `star_max`: stars on the record at once
- `rescue_bonus`: free stars for each friend who pulls someone up

---- Bot partners -------------------------------------------------------------------------
- `bot_error_r1`: chance a bot mistimes a pang, round 1
- `bot_fooled`: chance a bot falls for a fake-out
- `bot_help`: chance the nearest bot goes to a hanging friend unasked (a call always brings them)
- `bot_react`: s before impact a bot starts its skill

---- Music, camera and feel ---------------------------------------------------------------
- `cam_height`: m above the disc
- `cam_dist`: m back from the centre
- `cam_fov`: degrees
- `cam_shake`: x screen shake on a pang
- combo_r1/r2/r3: hits in a combo pang (연속 팡팡), one every two beats, per round
- crit_chance_r1/r2/r3: share of ordinary pangs that are critical, per round
- crit_mult: x power of a critical pang
- disc_bounce: m/s the disc jumps on a pang (was 5.2)
- disc_wobble: degrees the disc rattles on a pang
- rumble_ms: gamepad and phone vibration per pang
- turbo_mult / turbo_hold / turbo_chance_r1..r3: spin bursts (x cruising spin, seconds, share of DJ moves)
- brace_cost: on a tilt, bracing uphill drains the gauge at this share of the animal's skill rate
- brace_walk: x walk control while bracing
- slide_mult: x slide for an animal that does not brace
- wobble_*: 출렁이, a tilt (degrees) whose low side goes round in wobble_period s, lasting wobble_secs; wobble_share_r2/r3 = share of shake moves that are wobbles
- rattle_*: 두두두, bounces at rattle_power x pang every rattle_gap s for rattle_min..max s; each pushes an unbraced animal rattle_push m/s and costs a braced one rattle_cost gauge; rattle_finish = chance a big pang follows
- shake_spin: x spin while shaking; shake_chance_r1..r3: share of DJ moves that are shakes
- gate_tilt_angle / gate_tilt_secs: an opening gate tips the disc toward itself (degrees, seconds); gate_rattle: chance a 두두두 follows 1-2 s later
