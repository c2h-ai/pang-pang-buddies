// PROTOTYPE - NOT FOR PRODUCTION
// Question: DJ의 예고를 읽고 동물 스킬로 서로를 구하는 60초가, 봇과 혼자 해도 여럿이 해도 웃기고 다시 하고 싶은가?
// Date: 2026-11-19
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
window.CONFIG = {
  seed: 1, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
  volume: { value: 0.7, min: 0, max: 1, step: 0.05 },

  // ---- The ride: what the DJ does to the disc (the values that matter most) ----------------
  pang_power: { value: 8.2, min: 4, max: 14, step: 0.1 },        // m/s upward for a weight-1 animal at power 1
  pang_kick: { value: 2.4, min: 0, max: 5, step: 0.1 },          // m/s outward shove added by a pang
  spin_r1: { value: 0.82, min: 0.2, max: 2.5, step: 0.05 },      // rad/s, round 1's cruising spin
  spin_r2: { value: 1.0, min: 0.2, max: 2.5, step: 0.05 },      // rad/s, round 2
  spin_r3: { value: 1.15, min: 0.2, max: 2.5, step: 0.05 },       // rad/s, the finale
  spin_accel: { value: 0.7, min: 0.1, max: 4, step: 0.05 },      // rad/s^2, how fast the DJ changes speed
  scratch_accel: { value: 5, min: 1, max: 12, step: 0.25 },      // rad/s^2 while the record is scratched backwards
  spin_push: { value: 0.55, min: 0, max: 1, step: 0.05 },        // share of the spin's outward pull an animal feels
  grip_stiffness: { value: 9, min: 2, max: 30, step: 0.5 },      // 1/s, how firmly feet follow the floor (lower = more creep)
  gravity: { value: 22, min: 8, max: 40, step: 0.5 },            // m/s^2
  tilt_angle: { value: 10, min: 0, max: 22, step: 0.5 },         // degrees the disc leans
  tilt_hold: { value: 3, min: 0.5, max: 8, step: 0.1 },          // s a tilt is held
  tilt_slide: { value: 1, min: 0, max: 3, step: 0.05 },          // x gravity along the slope

  // ---- The challenge: rounds and the DJ's ramp ---------------------------------------------
  round_seconds: { value: 60, min: 20, max: 120, step: 5 },      // s per round (one song)
  rest_seconds: { value: 9, min: 3, max: 20, step: 1 },          // s of rest between rounds
  first_pang: { value: 10, min: 4, max: 25, step: 0.5 },         // s into round 1: the gentle teaching pang
  first_strong_pang: { value: 20, min: 10, max: 40, step: 0.5 }, // s into round 1: the first real trouble
  pang_gap_r1: { value: 6.5, min: 2.5, max: 12, step: 0.1 },     // s between the DJ's moves, round 1
  pang_gap_r2: { value: 5.2, min: 2.5, max: 12, step: 0.1 },     // round 2
  pang_gap_r3: { value: 4.4, min: 2.5, max: 12, step: 0.1 },     // the finale
  fake_chance_r2: { value: 0.22, min: 0, max: 1, step: 0.02 },   // share of round-2 pangs that are fake-outs
  fake_chance_r3: { value: 0.35, min: 0, max: 1, step: 0.02 },   // the finale
  gates_r3: { value: 4, min: 0, max: 6, step: 1 },               // rail segments (of 8) that open in the finale
  gate_warn: { value: 1.6, min: 0.5, max: 4, step: 0.1 },        // s a segment blinks before it drops
  spot_bonus: { value: 1.45, min: 1, max: 2.5, step: 0.05 },     // x launch for the animal the DJ calls out
  spot_warn: { value: 2.2, min: 0.8, max: 5, step: 0.1 },        // s the spotlight shows before its pang

  // ---- The limit: one gauge, drained while a skill is held ----------------------------------
  gauge_regen: { value: 0.5, min: 0.1, max: 2, step: 0.01 },    // gauge per second while resting
  regen_delay: { value: 0.5, min: 0, max: 2, step: 0.05 },       // s after release before it refills
  tired_time: { value: 1.6, min: 0.3, max: 4, step: 0.1 },       // s locked out after the gauge empties
  pang_gauge_cost: { value: 0.15, min: 0, max: 0.6, step: 0.01 },// gauge a holding animal loses per pang (power 1)

  // ---- Elephant (코코): holds the rail with the trunk, shelters whoever touches it ------------
  ele_gauge: { value: 5, min: 1, max: 12, step: 0.1 },           // s of trunk grip
  trunk_reach: { value: 2.7, min: 1, max: 5, step: 0.1 },        // m from elephant to rail
  shelter_range: { value: 0.55, min: 0, max: 2, step: 0.05 },    // m of gap that still counts as touching
  shelter_cost: { value: 0.45, min: 0, max: 2, step: 0.05 },     // extra drain per sheltered friend
  ele_walk: { value: 3, min: 1, max: 8, step: 0.1 },             // m/s
  ele_traction: { value: 11, min: 2, max: 25, step: 0.5 },       // m/s^2 of grip before it slides
  ele_launch: { value: 0.75, min: 0.3, max: 2, step: 0.02 },     // x pang power (heavy)

  // ---- Bird (삐삐): flies briefly, carries the nearest friend -------------------------------
  bird_gauge: { value: 2.2, min: 0.5, max: 6, step: 0.1 },       // s of flight alone
  fly_speed: { value: 6.2, min: 2, max: 12, step: 0.1 },         // m/s
  fly_height: { value: 1.9, min: 0.8, max: 4, step: 0.1 },       // m above the disc
  carry_reach: { value: 1.6, min: 0.5, max: 4, step: 0.1 },      // m to pick a friend up
  carry_cost_light: { value: 1.5, min: 1, max: 4, step: 0.1 },   // x drain carrying the octopus or monkey
  carry_cost_heavy: { value: 3.6, min: 1, max: 8, step: 0.1 },   // x drain carrying the elephant
  bird_walk: { value: 4.6, min: 1, max: 8, step: 0.1 },
  bird_traction: { value: 6, min: 2, max: 25, step: 0.5 },
  bird_launch: { value: 1.22, min: 0.3, max: 2, step: 0.02 },    // light: thrown highest

  // ---- Octopus (무너): suckers stick anywhere, walks slowly while stuck ----------------------
  oct_gauge: { value: 3.6, min: 0.5, max: 8, step: 0.1 },        // s of suction
  suction_walk: { value: 0.42, min: 0, max: 1, step: 0.02 },     // x walk speed while stuck
  arm_reach: { value: 1.7, min: 0.5, max: 4, step: 0.1 },        // m to hold one friend with an arm
  arm_cost: { value: 0.4, min: 0, max: 2, step: 0.05 },          // extra drain while holding a friend
  oct_walk: { value: 3.8, min: 1, max: 8, step: 0.1 },
  oct_traction: { value: 8, min: 2, max: 25, step: 0.5 },
  oct_launch: { value: 1, min: 0.3, max: 2, step: 0.02 },

  // ---- Monkey (몽이): tail hooks a friend in danger, or the rail ----------------------------
  mon_gauge: { value: 2.6, min: 0.5, max: 6, step: 0.1 },        // s hanging on the rail by the tail
  tail_range: { value: 6, min: 2, max: 12, step: 0.25 },         // m to snatch a friend
  tail_hook_range: { value: 4.2, min: 1, max: 8, step: 0.1 },    // m to hook the rail
  tail_cost: { value: 0.42, min: 0.05, max: 1, step: 0.01 },     // gauge spent per snatch
  mon_walk: { value: 5, min: 1, max: 8, step: 0.1 },
  mon_traction: { value: 7.5, min: 2, max: 25, step: 0.5 },
  mon_launch: { value: 1.05, min: 0.3, max: 2, step: 0.02 },

  // ---- Down, not out: hanging and rescue ----------------------------------------------------
  hang_time: { value: 5, min: 1.5, max: 12, step: 0.25 },        // s an animal dangles before it drops
  hang_pang_loss: { value: 0.9, min: 0, max: 3, step: 0.1 },     // s of hang time a pang shakes off
  rescue_time: { value: 0.9, min: 0.3, max: 4, step: 0.1 },      // s beside a hanging friend to pull it up
  rescue_reach: { value: 1.7, min: 0.8, max: 4, step: 0.1 },     // m from the friend's spot on the rim
  self_rescue_cost: { value: 0.5, min: 0.1, max: 1, step: 0.05 },// gauge the bird or monkey pays to climb back alone
  saved_shield: { value: 1.1, min: 0, max: 3, step: 0.1 },       // s nothing can throw an animal just pulled up
  self_climb: { value: 0.04, min: 0, max: 0.3, step: 0.01 },     // climb progress per skill-key tap while hanging (1 = back on)
  bot_climb: { value: 0.04, min: 0, max: 0.3, step: 0.01 },      // chance per step a hanging bot taps to climb

  // ---- Stars to collect -----------------------------------------------------------------------
  star_every: { value: 2.2, min: 0.5, max: 8, step: 0.1 },       // s between new stars on the record
  star_max: { value: 6, min: 1, max: 10, step: 1 },              // stars on the record at once
  rescue_bonus: { value: 3, min: 0, max: 10, step: 1 },          // free stars for each friend who pulls someone up

  // ---- Bot partners -------------------------------------------------------------------------
  bot_error_r1: { value: 0.14, min: 0, max: 1, step: 0.02 },     // chance a bot mistimes a pang, round 1
  bot_error_r2: { value: 0.22, min: 0, max: 1, step: 0.02 },
  bot_error_r3: { value: 0.28, min: 0, max: 1, step: 0.02 },
  bot_fooled: { value: 0.6, min: 0, max: 1, step: 0.05 },        // chance a bot falls for a fake-out
  bot_help: { value: 0.5, min: 0, max: 1, step: 0.05 },          // chance the nearest bot goes to a hanging friend unasked (a call always brings them)
  bot_react: { value: 0.3, min: 0.1, max: 0.8, step: 0.02 },     // s before impact a bot starts its skill

  // ---- Music, camera and feel ---------------------------------------------------------------
  bpm_r1: { value: 112, min: 80, max: 150, step: 1 },
  bpm_r2: { value: 120, min: 80, max: 150, step: 1 },
  bpm_r3: { value: 128, min: 80, max: 160, step: 1 },
  music_volume: { value: 0.6, min: 0, max: 1, step: 0.05 },
  sfx_volume: { value: 0.9, min: 0, max: 1, step: 0.05 },
  cam_height: { value: 14.2, min: 6, max: 24, step: 0.25 },      // m above the disc
  cam_dist: { value: 16.4, min: 8, max: 28, step: 0.25 },        // m back from the centre
  cam_fov: { value: 42, min: 25, max: 65, step: 1 },             // degrees
  cam_shake: { value: 0.6, min: 0, max: 2, step: 0.05 },         // x screen shake on a pang
};
