# TGM3 Overlay

Tetris: The Grand Master 3 메모리 비주얼라이저 — 오리지널(WinUI 3 / .NET 8)의
경량 리라이트. [Tauri 2](https://tauri.app) + React + TypeScript + Rust.

> 레포: `tgm3-overlay` · 오리지널(WinUI 3): `tgm3-visualizer`

## 용도: OBS 사이드 패널 (480×1080 고정)

게임이 1280×960(4:3)으로 출력되고, OBS에서 1920×1080 캔버스에 게임을
1440×1080으로 업스케일해 배치하면 남는 **우측 480×1080 영역을 이 프로그램이
채운다.** 따라서 창은 480×1080 고정·리사이즈 불가이며, **어떤 상황에서도
스크롤바가 나오지 않도록** 레이아웃되어 있다.

## 원본 대비 개선

| | 오리지널 (WinUI 3) | v2 (Tauri 2) |
|---|---|---|
| 배포 크기 | ~109 MB (self-contained) | 목표 5-10 MB |
| 외부 의존 | VC++ 런타임 필요 (포맷 후 실행 불가 원인) | WebView2 (Win10/11 기본 탑재) |
| 메모리 읽기 | 틱당 ~270회 ReadProcessMemory | 틱당 9회 (배치 읽기) |
| 폴링→UI | 8ms 타이머 전체 리렌더 | 변경 시에만 이벤트 emit |

## 구조

```
src/                    프론트엔드 (React + TS)
  core/                 ★ 오리지널 Core 라이브러리의 1:1 TypeScript 포팅
    types.ts              GameState / ProcessedGameState / GameType
    sections.ts           모드별 섹션 리스트 유도 (VM 로직 포팅)
    sectionConstants.ts   Cool/Regret 시간 임계값
    lockFrames.ts         모드별 최대 락 프레임
    converters.ts         등급 → 표시명 변환기들
    calculators.ts        감쇠/리그렛/등급히스토리/섹션시간 계산
    processors/           모드별 상태 프로세서 (Master/Shirase/Easy/Sakura)
    __tests__/            포팅 검증 유닛테스트 (C# 동작값 기준)
  hooks/                  useGameMonitor (IPC 구독), useViewMode (뷰 전환 상태머신),
                          useGradeUpSound (등급업 사운드 트리거)
  views/                  모드별 뷰 4종 (원본 Views/*ModeView.xaml 대응)
  components/             PlayerInfoCard, PlayfieldCanvas(원본 스프라이트), cards, SectionTimerControl
  assets/                 BlockPixelData(추출 스프라이트), GradeUp.wav
src-tauri/              백엔드 (Rust)
  src/addresses.rs      ★ 메모리 주소 맵 (MemoryAddresses.cs 1:1, 배치 블록 정의)
  src/memory.rs         game.exe 탐색/연결/8ms 폴링/배치 읽기/이벤트 emit
scripts/                extract-block-pixels.mjs (원본 스프라이트 추출)
```

★ = 오리지널(`D:\Users\Documents\Workspace\tgm3-visualizer`)과의 대응 관계

## 개발

```powershell
npm install          # 최초 1회
npm run test         # Core 포팅 유닛테스트 (vitest)
npm run tauri dev    # 개발 실행
```

요구 사항: Node.js, Rust(stable-msvc), VS Build Tools(C++ 워크로드)

## 게임 연결

TGM3(`game.exe`)이 실행 중이면 500ms 간격으로 자동 탐색·연결한다.
연결 후 8ms 간격으로 메모리를 폴링하며, 상태가 변했을 때만 프론트엔드로
`game-state` 이벤트를 보낸다. 프로세스 종료 시 자동 재연결 대기.

## 빌드 / 배포

```powershell
npm run tauri build   # NSIS 설치더 + portable exe → src-tauri/target/release/bundle/
```
