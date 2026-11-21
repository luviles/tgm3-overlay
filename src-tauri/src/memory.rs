//! TGM3 process memory reader + polling thread.
//!
//! Replaces the original C# `MemoryService` + `GameDataService.ReadGameState`.
//! Improvements over the original:
//! - Batched reads: ~270 ReadProcessMemory calls/tick -> 8 calls/tick
//!   (the playfield is contiguous, so one 2112-byte read covers all 220 cells)
//! - Emits to the frontend only when the serialized tick actually changed
//! - Self-healing reconnect (every 500ms while disconnected)

use serde::Serialize;
use std::mem::zeroed;
use std::time::{Duration, Instant};
use tauri::Emitter;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
};

use crate::addresses::*;

/// Poll interval — matches the original visualizer's 8ms DispatcherQueueTimer.
const POLL_INTERVAL: Duration = Duration::from_millis(8);
/// Reconnect attempt interval while the game is not running.
const RECONNECT_INTERVAL: Duration = Duration::from_millis(500);

/// One complete read of the TGM3 game state.
/// Field names serialize to camelCase to match the TypeScript `GameState`.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameTick {
    pub final_grade: u16,
    pub section_grade_points: u8,
    pub section_regret_count: u8,
    pub awarded_grade_points: u8,
    pub decay_time: u8,
    pub internal_grade: u8,
    pub level: u16,
    pub time_frames: i32,
    pub game_type: i32,
    pub seventy_percent_checkpoint_count: u8,
    pub section_cool_flag: u8,
    pub staff_roll_time: u16,
    pub staff_roll_tetris_count: u16,
    pub staff_roll_line_clear: u16,
    pub hanabi_score: u16,

    pub nickname: String,
    pub playtime: i32,
    pub decoration_points: i32,
    pub world_easy_hi_score: u16,
    pub classic_easy_hi_score: u16,
    pub world_sakura_hi_grade: u8,
    pub classic_sakura_hi_grade: u8,
    pub world_master_current_grade: u8,
    pub classic_master_current_grade: u8,
    pub world_shirase_hi_grade: u8,
    pub classic_shirase_hi_grade: u8,
    /// [7] NEWEST FIRST (matches the original C# read order; the grade-history
    /// calculator reverses it again to oldest-first internally)
    pub world_master_grade_history: [u8; 7],
    pub classic_master_grade_history: [u8; 7],
    pub world_demotion_points: u8,
    pub classic_demotion_points: u8,

    pub game_process_status: u8,
    pub field_status: u8,
    pub game_flag: u8,

    /// [22][10], index [y][x], y=0 bottom. Same encoding as the original:
    /// 0=empty, 2-8=piece colors, 9=flash, 0x12-0x18=jewel, 0x19=flash jewel
    pub playfield: [[u8; 10]; 22],

    pub lock_delay: u8,
    pub shift_move_reset_count: u8,
    pub rotation_move_reset_count: u8,
    pub garbage_quota: u8,

    pub sakura_stage_limit_time: i32,
    pub sakura_stage_elapsed_time: i32,
    pub sakura_stage_level: u8,
    pub sakura_cleared_stage_level: u8,

    pub master_exam_flags: u8,
}

pub struct MemoryReader {
    handle: Option<HANDLE>,
}

impl MemoryReader {
    pub fn new() -> Self {
        Self { handle: None }
    }

    pub fn is_connected(&self) -> bool {
        self.handle.is_some()
    }

    pub fn disconnect(&mut self) {
        if let Some(h) = self.handle.take() {
            let _ = unsafe { CloseHandle(h) };
        }
    }

    /// Find the TGM3 process (game.exe) and open a read handle.
    pub fn try_connect(&mut self) -> bool {
        self.disconnect();

        let Some(pid) = find_game_pid() else {
            return false;
        };

        // PROCESS_VM_READ (0x0010) | PROCESS_QUERY_INFORMATION (0x0400)
        match unsafe { OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid) } {
            Ok(h) => {
                self.handle = Some(h);
                true
            }
            Err(_) => false,
        }
    }

    fn read_raw(&self, addr: usize, buf: &mut [u8]) -> bool {
        let Some(h) = self.handle else { return false };
        let mut read = 0usize;
        let ok = unsafe {
            ReadProcessMemory(
                h,
                addr as *const _,
                buf.as_mut_ptr() as *mut _,
                buf.len(),
                Some(&mut read),
            )
        };
        ok.is_ok() && read == buf.len()
    }

    /// Reads one complete game tick. Err(()) means the gate reads failed
    /// (process gone / memory unmapped) and the connection should be dropped.
    pub fn read_tick(&self) -> Result<GameTick, ()> {
        if !self.is_connected() {
            return Err(());
        }

        // Gate reads (original aborts the tick when Level/Time/GameType fail)
        let mut a = [0u8; BLOCK_A_LEN];
        if !self.read_raw(BLOCK_A, &mut a) {
            return Err(());
        }
        let mut gt = [0u8; 4];
        if !self.read_raw(GAME_TYPE, &mut gt) {
            return Err(());
        }

        // Optional reads — buffers are zero-initialized, so a failed read
        // yields zeros exactly like the original's per-field fallback.
        let mut b = [0u8; BLOCK_B_LEN];
        let _ = self.read_raw(BLOCK_B, &mut b);
        let mut c = [0u8; 2];
        let _ = self.read_raw(STAFF_ROLL_TIME, &mut c);
        let mut d = [0u8; PLAYFIELD_BYTES];
        let _ = self.read_raw(PLAYFIELD_1P, &mut d);
        let mut f = [0u8; BLOCK_F_LEN];
        let _ = self.read_raw(BLOCK_F, &mut f);
        let mut g = [0u8; BLOCK_G_LEN];
        let _ = self.read_raw(BLOCK_G, &mut g);
        let mut h = [0u8; 1];
        let _ = self.read_raw(GAME_PROCESS_STATUS, &mut h);

        // Playfield: cell (x,y) at BLOCK base + y*96 + x*8, byte0=type, byte1=brightness
        let mut playfield = [[0u8; 10]; 22];
        for y in 0..22usize {
            for x in 0..10usize {
                let off = y * 96 + x * 8;
                let mut block_type = d[off];
                if d[off + 1] == 1 {
                    if (0x02..=0x08).contains(&block_type) {
                        block_type = 0x09;
                    } else if (0x12..=0x18).contains(&block_type) {
                        block_type = 0x19;
                    }
                }
                playfield[y][x] = block_type;
            }
        }

        // Nickname: keep printable ASCII only (mirrors C# `b >= 32` filter)
        let nickname: String = (0..3)
            .filter_map(|i| {
                let ch = f[F_NICKNAME + i];
                (ch >= 32).then_some(ch as char)
            })
            .collect();

        // Grade history: memory stores oldest at the start address; the original
        // writes arr[6-i] so the array ends up NEWEST-first.
        let mut world_history = [0u8; 7];
        let mut classic_history = [0u8; 7];
        for i in 0..7 {
            world_history[i] = f[F_WORLD_MASTER_GRADE_HISTORY + (6 - i)];
            classic_history[i] = f[F_CLASSIC_MASTER_GRADE_HISTORY + (6 - i)];
        }

        Ok(GameTick {
            final_grade: u16_at(&b, B_FINAL_GRADE),
            section_grade_points: a[A_SECTION_GRADE_POINTS],
            section_regret_count: a[A_SECTION_REGRET_COUNT],
            awarded_grade_points: b[B_AWARDED_GRADE_POINTS],
            decay_time: b[B_DECAY_TIME],
            internal_grade: b[B_INTERNAL_GRADE],
            level: u16_at(&a, A_LEVEL),
            time_frames: i32_at(&a, A_TIME),
            game_type: i32_at(&gt, 0),
            seventy_percent_checkpoint_count: b[B_SEVENTY_PERCENT_CHECKPOINT_COUNT],
            section_cool_flag: a[A_SECTION_COOL_FLAG],
            staff_roll_time: u16_at(&c, 0),
            staff_roll_tetris_count: u16_at(&b, B_STAFF_ROLL_TETRIS_COUNT),
            staff_roll_line_clear: u16_at(&b, B_STAFF_ROLL_LINE_CLEAR),
            hanabi_score: u16_at(&a, A_HANABI_SCORE),
            nickname,
            playtime: i32_at(&f, F_PLAYTIME).min(99999),
            decoration_points: i32_at(&f, F_DECORATION_POINTS).min(100_000),
            world_easy_hi_score: u16_at(&f, F_WORLD_EASY_HI_SCORE),
            classic_easy_hi_score: u16_at(&f, F_CLASSIC_EASY_HI_SCORE),
            world_sakura_hi_grade: f[F_WORLD_SAKURA_HI_GRADE],
            classic_sakura_hi_grade: f[F_CLASSIC_SAKURA_HI_GRADE],
            world_master_current_grade: f[F_WORLD_MASTER_CURRENT_GRADE],
            classic_master_current_grade: f[F_CLASSIC_MASTER_CURRENT_GRADE],
            world_shirase_hi_grade: f[F_WORLD_SHIRASE_HI_GRADE],
            classic_shirase_hi_grade: f[F_CLASSIC_SHIRASE_HI_GRADE],
            world_master_grade_history: world_history,
            classic_master_grade_history: classic_history,
            world_demotion_points: f[F_WORLD_DEMOTION_POINTS],
            classic_demotion_points: f[F_CLASSIC_DEMOTION_POINTS],
            game_process_status: h[0],
            field_status: a[A_FIELD_STATUS],
            game_flag: a[A_GAME_FLAG],
            playfield,
            lock_delay: g[G_LOCK_DELAY],
            shift_move_reset_count: g[G_SHIFT_MOVE_RESET_COUNT],
            rotation_move_reset_count: g[G_ROTATION_MOVE_RESET_COUNT],
            garbage_quota: g[G_GARBAGE_QUOTA],
            sakura_stage_limit_time: i32_at(&a, A_SAKURA_STAGE_LIMIT_TIME),
            sakura_stage_elapsed_time: i32_at(&a, A_SAKURA_STAGE_ELAPSED_TIME),
            sakura_stage_level: a[A_SAKURA_STAGE_LEVEL],
            sakura_cleared_stage_level: a[A_SAKURA_CLEARED_STAGE_LEVEL],
            master_exam_flags: a[A_MASTER_EXAM_FLAGS],
        })
    }
}

/// Spawn the 8ms polling thread. Emits `game-state` (GameTick) only when the
/// tick actually changed.
pub fn spawn_poll_thread(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut reader = MemoryReader::new();
        let mut last_tick: Option<GameTick> = None;
        let mut last_connect_attempt = Instant::now() - RECONNECT_INTERVAL;

        loop {
            if !reader.is_connected() {
                if last_connect_attempt.elapsed() >= RECONNECT_INTERVAL {
                    last_connect_attempt = Instant::now();
                    reader.try_connect();
                }
                if !reader.is_connected() {
                    std::thread::sleep(RECONNECT_INTERVAL);
                }
            } else {
                match reader.read_tick() {
                    Ok(tick) => {
                        if last_tick.as_ref() != Some(&tick) {
                            let _ = app.emit("game-state", &tick);
                            last_tick = Some(tick);
                        }
                    }
                    Err(_) => reader.disconnect(),
                }
            }

            std::thread::sleep(POLL_INTERVAL);
        }
    });
}

fn find_game_pid() -> Option<u32> {
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        let mut pid = None;
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let name_len = entry
                    .szExeFile
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..name_len]).to_lowercase();
                if name == TARGET_PROCESS_NAME {
                    pid = Some(entry.th32ProcessID);
                    break;
                }
                if !Process32NextW(snap, &mut entry).is_ok() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        pid
    }
}

// Little-endian readers (mirrors C# `bytes[0] + bytes[1]*256` / BitConverter)
fn u16_at(buf: &[u8], off: usize) -> u16 {
    u16::from_le_bytes([buf[off], buf[off + 1]])
}

fn i32_at(buf: &[u8], off: usize) -> i32 {
    i32::from_le_bytes([buf[off], buf[off + 1], buf[off + 2], buf[off + 3]])
}
