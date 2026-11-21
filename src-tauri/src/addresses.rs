//! TGM3 memory address map.
//! Ported 1:1 from Tgm3Visualizer.Core/Models/MemoryAddresses.cs (absolute addresses).
//!
//! The original visualizer reads absolute addresses with the process handle
//! (no module-base relocation), so this port keeps exactly the same behavior.

// ---------------------------------------------------------------------------
// Batched read regions (optimization over the original's per-field reads)
// ---------------------------------------------------------------------------

/// Block A: 0x4AE300..=0x4AE359 — level, section flags, times, sakura, hanabi
pub const BLOCK_A: usize = 0x4AE300;
pub const BLOCK_A_LEN: usize = 0x5A;

/// Block B: 0x4ACD8C..=0x4ACDAB — grade internals, staff roll counters
pub const BLOCK_B: usize = 0x4ACD8C;
pub const BLOCK_B_LEN: usize = 0x20;

/// Block C: staff roll time (2 bytes)
pub const STAFF_ROLL_TIME: usize = 0x4AB7F4;

/// Block D: 1P playfield — 10x22 cells, 8 bytes/cell, 12 cells/row (96B stride)
pub const PLAYFIELD_1P: usize = 0x04AB9A8;
pub const PLAYFIELD_BYTES: usize = 22 * 96; // 2112

/// Block F: 0x4AE250..=0x4AE27F — player info, hi-scores, grade history
pub const BLOCK_F: usize = 0x4AE250;
pub const BLOCK_F_LEN: usize = 0x30;

/// Block G: 0x4AF2E8..=0x4AF301 — move resets, garbage quota, lock delay
pub const BLOCK_G: usize = 0x4AF2E8;
pub const BLOCK_G_LEN: usize = 0x1A;

/// Game process status (1 byte, value 3 = playing)
pub const GAME_PROCESS_STATUS: usize = 0x4BA9FC;

/// Game type enum (4 bytes, Int32)
pub const GAME_TYPE: usize = 0x4B3D5C;

// ---------------------------------------------------------------------------
// Individual field offsets inside blocks (offset from block base)
// ---------------------------------------------------------------------------

/// Block A offsets
pub const A_LEVEL: usize = 0x00; // u16
pub const A_SECTION_COOL_FLAG: usize = 0x06; // u8
pub const A_SECTION_GRADE_POINTS: usize = 0x10; // u8
pub const A_SECTION_REGRET_COUNT: usize = 0x16; // u8
pub const A_FIELD_STATUS: usize = 0x1C; // u8 (bit 6: invisible roll)
pub const A_GAME_FLAG: usize = 0x1D; // u8 (bit 0: staff roll, bit 4: WORLD)
pub const A_MASTER_EXAM_FLAGS: usize = 0x2B; // u8 (bit 1: promotion, bit 4: demotion)
pub const A_SAKURA_STAGE_LEVEL: usize = 0x31; // u8
pub const A_SAKURA_CLEARED_STAGE_LEVEL: usize = 0x32; // u8
pub const A_TIME: usize = 0x3C; // i32 frames
pub const A_SAKURA_STAGE_LIMIT_TIME: usize = 0x40; // i32 frames
pub const A_SAKURA_STAGE_ELAPSED_TIME: usize = 0x48; // i32 frames
pub const A_HANABI_SCORE: usize = 0x58; // u16

/// Block B offsets
pub const B_SEVENTY_PERCENT_CHECKPOINT_COUNT: usize = 0x00; // u8
pub const B_FINAL_GRADE: usize = 0x02; // u16
pub const B_AWARDED_GRADE_POINTS: usize = 0x0A; // u8
pub const B_INTERNAL_GRADE: usize = 0x0B; // u8
pub const B_DECAY_TIME: usize = 0x0E; // u8
pub const B_STAFF_ROLL_TETRIS_COUNT: usize = 0x1C; // u16
pub const B_STAFF_ROLL_LINE_CLEAR: usize = 0x1E; // u16

/// Block F offsets
pub const F_NICKNAME: usize = 0x00; // 3 bytes ASCII
pub const F_PLAYTIME: usize = 0x08; // i32
pub const F_DECORATION_POINTS: usize = 0x0C; // i32
pub const F_CLASSIC_MASTER_CURRENT_GRADE: usize = 0x10; // u8
pub const F_CLASSIC_MASTER_GRADE_HISTORY: usize = 0x11; // 7 bytes
pub const F_CLASSIC_DEMOTION_POINTS: usize = 0x1A; // u8
pub const F_CLASSIC_EASY_HI_SCORE: usize = 0x1C; // u16
pub const F_CLASSIC_SAKURA_HI_GRADE: usize = 0x1E; // u8
pub const F_CLASSIC_SHIRASE_HI_GRADE: usize = 0x1F; // u8
pub const F_WORLD_MASTER_CURRENT_GRADE: usize = 0x20; // u8
pub const F_WORLD_MASTER_GRADE_HISTORY: usize = 0x21; // 7 bytes
pub const F_WORLD_DEMOTION_POINTS: usize = 0x2A; // u8
pub const F_WORLD_EASY_HI_SCORE: usize = 0x2C; // u16
pub const F_WORLD_SAKURA_HI_GRADE: usize = 0x2E; // u8
pub const F_WORLD_SHIRASE_HI_GRADE: usize = 0x2F; // u8

/// Block G offsets
pub const G_ROTATION_MOVE_RESET_COUNT: usize = 0x00; // u8
pub const G_SHIFT_MOVE_RESET_COUNT: usize = 0x02; // u8
pub const G_GARBAGE_QUOTA: usize = 0x07; // u8
pub const G_LOCK_DELAY: usize = 0x19; // u8

/// TGM3 runs as "game.exe" (Taito Type-X)
pub const TARGET_PROCESS_NAME: &str = "game.exe";
