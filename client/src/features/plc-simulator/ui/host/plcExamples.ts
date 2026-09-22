import type { SymbolMap } from '../../transpiler';

export interface PlcExample {
  id: string;
  title: string;
  stl: string;
  symbols?: SymbolMap;
}

export const PLC_EXAMPLES: readonly PlcExample[] = [
  {
    id: 'start-stop-seal-in',
    title: 'Start / Stop Motor (Seal-in Latch)',
    stl: `NETWORK 1 // Start / Stop Motor Seal-In
LD I0.0
O Q0.0
AN I0.1
= Q0.0`,
    symbols: {
      'I0.0': { name: 'Start_PB', comment: 'Start pushbutton (NO)' },
      'I0.1': { name: 'Stop_PB', comment: 'Stop pushbutton (NC contact)' },
      'Q0.0': { name: 'Motor', comment: 'Motor contactor' },
    },
  },
  {
    id: 'fwd-rev-interlock',
    title: 'Forward / Reverse Motor Interlock',
    stl: `NETWORK 1 // Forward Contactor (Blocked by Reverse)
LD I0.0
O Q0.0
AN I0.2
AN Q0.1
= Q0.0
NETWORK 2 // Reverse Contactor (Blocked by Forward)
LD I0.1
O Q0.1
AN I0.2
AN Q0.0
= Q0.1`,
    symbols: {
      'I0.0': { name: 'Fwd_PB', comment: 'Forward start button' },
      'I0.1': { name: 'Rev_PB', comment: 'Reverse start button' },
      'I0.2': { name: 'Stop_PB', comment: 'Master stop button' },
      'Q0.0': { name: 'KM1_Fwd', comment: 'Forward contactor' },
      'Q0.1': { name: 'KM2_Rev', comment: 'Reverse contactor' },
    },
  },
  {
    id: 'delayed-alarm-ton',
    title: 'Delayed Alarm (TON On-Delay Timer)',
    stl: `NETWORK 1 // Start / Stop Seal-In
LD I0.0
O Q0.0
AN I0.1
= Q0.0
NETWORK 2 // 5-Second Delay Timer (T37: 100ms * 50 = 5s)
LD Q0.0
TON T37, 50
NETWORK 3 // Alarm Output
LD T37
= Q0.1`,
    symbols: {
      'I0.0': { name: 'Start_PB', comment: 'Start pushbutton (NO)' },
      'I0.1': { name: 'Stop_PB', comment: 'Stop pushbutton (NC contact)' },
      'Q0.0': { name: 'Motor', comment: 'Motor contactor' },
      'Q0.1': { name: 'Alarm_Horn', comment: 'Alarm beacon' },
      T37: { name: 'Alarm_Timer', comment: 'On-delay timer (100ms base, 5.0s)' },
    },
  },
  {
    id: 'off-delay-fan-tof',
    title: 'Off-Delay Fan Controller (TOF Timer)',
    stl: `NETWORK 1 // TOF Off-Delay Timer (T37: 100ms * 100 = 10s fan run after stop)
LD I0.0
TOF T37, 100
NETWORK 2 // Exhaust Fan Output
LD T37
= Q0.0`,
    symbols: {
      'I0.0': { name: 'Heat_Trigger', comment: 'Thermostat input' },
      'Q0.0': { name: 'Exhaust_Fan', comment: 'Exhaust fan drive' },
      T37: { name: 'Cooling_Timer', comment: 'Off-delay timer (100ms base, 10.0s)' },
    },
  },
  {
    id: 'flashing-pulse-generator',
    title: 'Flashing Indicator Light (Pulse Generator)',
    stl: `NETWORK 1 // Flash Timer 1 On (500ms)
LD I0.0
AN T38
TON T37, 5
NETWORK 2 // Flash Timer 2 Off (500ms)
LD T37
TON T38, 5
NETWORK 3 // Flasher Pilot Light
LD T37
AN T38
= Q0.0`,
    symbols: {
      'I0.0': { name: 'Enable_Flash', comment: 'Warning trigger' },
      'Q0.0': { name: 'Flash_Lamp', comment: 'Warning strobe' },
      T37: { name: 'On_Timer', comment: 'On pulse timer (100ms base, 500ms)' },
      T38: { name: 'Off_Timer', comment: 'Off pulse timer (100ms base, 500ms)' },
    },
  },
  {
    id: 'batch-parts-counter',
    title: 'Batch Parts Counter (CTU Up-Counter)',
    stl: `NETWORK 1 // Up-Counter C1 (Preset = 10)
LD I0.0
LD I0.1
CTU C1, 10
NETWORK 2 // Conveyor Motor Run
LD I0.2
AN C1
= Q0.0
NETWORK 3 // Batch Complete Indicator
LD C1
= Q0.1`,
    symbols: {
      'I0.0': { name: 'Part_Pulse', comment: 'Photo-eye pulse input' },
      'I0.1': { name: 'Reset_PB', comment: 'Reset counter button' },
      'I0.2': { name: 'Conveyor_Start', comment: 'Conveyor start switch' },
      'Q0.0': { name: 'Conveyor_MTR', comment: 'Feed conveyor drive' },
      'Q0.1': { name: 'Batch_Full', comment: 'Batch done signal' },
      C1: { name: 'Item_Counter', comment: 'Up counter C1 (PV=10)' },
    },
  },
  {
    id: 'star-delta-starter',
    title: 'Star-Delta (Wye-Delta) Motor Starter',
    stl: `NETWORK 1 // Main Contactor KM1
LD I0.0
O Q0.0
AN I0.1
= Q0.0
NETWORK 2 // Star-to-Delta Transition Timer (T37: 3s)
LD Q0.0
TON T37, 30
NETWORK 3 // Star Contactor KM2 (Interlocked with Delta)
LD Q0.0
AN T37
AN Q0.2
= Q0.1
NETWORK 4 // Delta Contactor KM3 (Interlocked with Star)
LD Q0.0
A T37
AN Q0.1
= Q0.2`,
    symbols: {
      'I0.0': { name: 'Start_PB', comment: 'Motor start button' },
      'I0.1': { name: 'Stop_PB', comment: 'Motor stop button' },
      'Q0.0': { name: 'Main_KM1', comment: 'Main contactor' },
      'Q0.1': { name: 'Star_KM2', comment: 'Star contactor' },
      'Q0.2': { name: 'Delta_KM3', comment: 'Delta contactor' },
      T37: { name: 'Timer_3s', comment: 'Transition timer (100ms base, 3.0s)' },
    },
  },
  {
    id: 'dual-tank-level-control',
    title: 'Dual Tank Automatic Level Control',
    stl: `NETWORK 1 // Pump 1 Run on Low Level Tank 1
LD I0.0
O Q0.0
AN I0.1
= Q0.0
NETWORK 2 // Pump 2 Run on Low Level Tank 2
LD I0.2
O Q0.1
AN I0.3
= Q0.1`,
    symbols: {
      'I0.0': { name: 'Tank1_Low', comment: 'Tank 1 low level switch' },
      'I0.1': { name: 'Tank1_High', comment: 'Tank 1 high level switch' },
      'I0.2': { name: 'Tank2_Low', comment: 'Tank 2 low level switch' },
      'I0.3': { name: 'Tank2_High', comment: 'Tank 2 high level switch' },
      'Q0.0': { name: 'Pump_1', comment: 'Supply pump 1' },
      'Q0.1': { name: 'Pump_2', comment: 'Supply pump 2' },
    },
  },
  {
    id: 'traffic-light-state-controller',
    title: 'Traffic Light 3-Phase State Controller',
    stl: `NETWORK 1 // Red Light Timer T37 (4s)
LD I0.0
AN T39
TON T37, 40
NETWORK 2 // Green Light Timer T38 (3s)
LD T37
TON T38, 30
NETWORK 3 // Yellow Light Timer T39 (1s)
LD T38
TON T39, 10
NETWORK 4 // Red Light Output
LD I0.0
AN T37
= Q0.0
NETWORK 5 // Green Light Output
LD T37
AN T38
= Q0.1
NETWORK 6 // Yellow Light Output
LD T38
AN T39
= Q0.2`,
    symbols: {
      'I0.0': { name: 'Sys_Enable', comment: 'System enable switch' },
      'Q0.0': { name: 'Red_Light', comment: 'Red light signal' },
      'Q0.1': { name: 'Green_Light', comment: 'Green light signal' },
      'Q0.2': { name: 'Yellow_Light', comment: 'Yellow light signal' },
      T37: { name: 'Red_Timer', comment: 'Red phase timer (100ms base, 4.0s)' },
      T38: { name: 'Green_Timer', comment: 'Green phase timer (100ms base, 3.0s)' },
      T39: { name: 'Yellow_Timer', comment: 'Yellow phase timer (100ms base, 1.0s)' },
    },
  },
  {
    id: 'analog-scaling-comparator',
    title: 'Analog Window Comparator & Limit Alarms',
    stl: `NETWORK 1 // High Limit Alarm (VW100 > 500)
LDW> VW100, 500
= Q0.0
NETWORK 2 // Low Limit Alarm (VW100 < 100)
LDW< VW100, 100
= Q0.1
NETWORK 3 // Normal In-Band Level OK Indicator (100 <= VW100 <= 500)
LDW>= VW100, 100
AW<= VW100, 500
= Q0.2`,
    symbols: {
      VW100: { name: 'Process_Val', comment: 'Process value word (0-1000)' },
      'Q0.0': { name: 'High_Alarm', comment: 'High limit exceeded' },
      'Q0.1': { name: 'Low_Alarm', comment: 'Low limit exceeded' },
      'Q0.2': { name: 'Normal_OK', comment: 'Process within normal limits' },
    },
  },
  {
    id: 'math-telemetry-registers',
    title: 'Math Operations & Register Telemetry',
    stl: `NETWORK 1 // Production Batch Part Counter (Target = 50)
LD I0.0
LD I0.1
CTU C1, 50
NETWORK 2 // Calculate Batch Weight with Tare Offset (VW10 + 25 = VW12)
LD I0.2
MOVW VW10, VW12
+I 25, VW12
NETWORK 3 // Batch Target Weight Exceeded Alarm
LDW>= VW12, 1000
= Q0.0
NETWORK 4 // Batch Complete Count Pilot Light
LD C1
= Q0.1`,
    symbols: {
      'I0.0': { name: 'Part_Pulse', comment: 'Part detector pulse' },
      'I0.1': { name: 'Reset_PB', comment: 'Reset counter button' },
      'I0.2': { name: 'Calc_Enable', comment: 'Calculate weight trigger' },
      VW10: { name: 'Net_Weight', comment: 'Net weight register' },
      VW12: { name: 'Gross_Weight', comment: 'Gross weight after tare offset' },
      'Q0.0': { name: 'Weight_Alarm', comment: 'Gross weight limit alarm' },
      'Q0.1': { name: 'Batch_Done', comment: 'Batch count target reached' },
      C1: { name: 'Batch_Count', comment: 'Production counter (PV=50)' },
    },
  },
];
