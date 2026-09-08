# Mozz Print Agent — Physical Thermal Printer Acceptance Checklist

This document defines the complete hardware acceptance, configuration, and verification procedure for physical thermal receipt printers operating with **Mozz Print Agent (Starters4U POS)** on Windows 10/11.

---

## 1. Architecture & Driver Clarification

> **Important Operational Specification**:
> Mozz Print Agent uses **Electron offscreen background rendering dispatched directly to installed Windows printer drivers**. 
> - It is **not** raw binary ESC/POS socket streaming.
> - The thermal printer **must** be installed in Windows ("Bluetooth & devices" > "Printers & scanners") with its manufacturer driver or "Generic / Text Only" driver before Mozz Print Agent can discover and print to it.
> - Electron's successful print callback confirms handoff to the **Windows Print Spooler**; pre-flight health checks query Windows for paper-out and offline states.

---

## 2. Printer Types & Connection Interfaces

| Interface | Setup Procedure | Verification Step |
| :--- | :--- | :--- |
| **USB Thermal Printer** (Epson TM-T82, POS-80, TVS RP-3200) | 1. Connect USB cable to Windows POS terminal.<br>2. Install manufacturer driver (e.g. Epson Advanced Printer Driver APD).<br>3. Windows assigns port (e.g., `USB001`). | Open Windows "Printer Properties" > Click **"Print Test Page"**. Ensure cutter cycles cleanly. |
| **Network / Ethernet Thermal Printer** (LAN / Static IP) | 1. Connect RJ-45 cable to restaurant LAN switch.<br>2. Assign fixed static IP via printer config utility (e.g., `192.168.1.200`).<br>3. In Windows: "Add Printer" > "Add using TCP/IP address".<br>4. Select Standard TCP/IP Port. | Ping printer IP from command prompt (`ping 192.168.1.200`) and print Windows test page. |
| **Bluetooth / Serial Thermal Printer** | Pair via Windows Bluetooth or COM port emulated driver (9600 / 115200 baud). | Verify COM port in Device Manager under "Ports (COM & LPT)". |

---

## 3. Paper Width Selection (58mm vs 80mm)

Mozz Print Agent dynamically adapts HTML/CSS layout constraints based on station configuration:

### 80mm Thermal Receipt Rolls (Standard for Billing & Master KOT)
* **Physical roll width**: 79.5 ± 0.5 mm
* **Effective printable area**: 72 mm (576 dots @ 203 DPI)
* **Character pitch**: 48 columns (Font A: 12x24) / 64 columns (Font B: 9x17)
* **Agent CSS container**: `max-width: 270px;` with zero margins
* **Ticket format**: Full item descriptions, shape/crust modifiers, table numbers, totals, GST breakdown, QR code.

### 58mm Thermal Receipt Rolls (Compact for Pizza / Bar / Mobile POS)
* **Physical roll width**: 57.5 ± 0.5 mm
* **Effective printable area**: 48 mm (384 dots @ 203 DPI)
* **Character pitch**: 32 columns (Font A: 12x24) / 42 columns (Font B: 9x17)
* **Agent CSS container**: `max-width: 190px;` with condensed spacing
* **Ticket format**: Streamlined item lines, bold table badge, truncated notes.

---

## 4. Hardware Cash Drawer Kick & Cutter Configuration

Most physical thermal printers control the cash drawer (via RJ-11/RJ-12 port) and internal auto-cutter via driver properties:

1. **Auto-Cutter Setup**:
   * Open Windows `Printers & scanners` > Select your printer > `Printing Preferences`.
   * Under **Operation / Paper / Quality** > Set **Paper Cut** to:
     * *End of Job: Full Cut* (or *Partial Cut* if retaining tickets on roll).
2. **Cash Drawer Kick Pulse**:
   * Under `Printing Preferences` > `Peripherals` or `Document Settings`:
   * Set **Cash Drawer #1** to: **"Open Before Printing"** or **"Open After Printing"**.
   * Standard ESC/POS kick pulse: `Pin 2 = 50ms pulse` (`ESC p 0 25 250`).
   * Test: In Mozz Print Agent, trigger a test **BILL** print. Verify cash drawer pops open automatically upon receipt dispatch.

---

## 5. Multi-Station Kitchen & Billing Routing Matrix

Configure physical thermal printers in Mozz Print Agent under **Hardware & Routing Settings**:

| Station Code | Target Department | Default Paper | Auto-Print | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `billing` | Cashier / Front Counter | 80mm | Yes | Customer tax invoices, payment receipts, UPI QR codes. |
| `kitchen_master` | Hot Kitchen / Main Chef | 80mm | Yes | Master kitchen order ticket with full order details and notes. |
| `kitchen_pizza` | Pizza / Oven Station | 58mm / 80mm | Yes | Filtered tickets for pocket pizzas, shapes (Round/Boat/Korean), crusts. |
| `bar_beverage` | Bar / Drink Counter | 58mm | Optional | Cold drinks, mocktails, juices. |

---

## 6. Hardware Failure & Recovery Scenarios (Sign-Off Checklist)

| Test Scenario | Action / Condition | Expected Agent Behavior | Sign-Off |
| :--- | :--- | :--- | :--- |
| **Normal Print (Happy Path)** | Order dispatched from POS | Job transitions `PENDING` -> `CLAIMED` -> `PRINTING` -> `PRINTED`. Ticket prints within 1.5s. Spool log recorded. | [ ] PASS |
| **Printer Offline / Disconnected** | Unplug USB or LAN cable | Pre-flight check detects Windows printer offline. Job marked `FAILED` with descriptive error. **No double printing**. | [ ] PASS |
| **Paper-Out Condition** | Remove paper roll from thermal printer | Windows spooler reports paper-out. Attempt logged as `FAILURE`. Once paper is reloaded, operator can click **"Retry"** in agent UI. | [ ] PASS |
| **Crash / Sudden Shutdown** | Terminate process or cut power while job is `CLAIMED` or `PRINTING` | On next agent launch, SQLite startup recovery flags in-flight job as **`UNCERTAIN_RECOVERY`**. Requires visual ticket inspection before manual reprint. **Prevents accidental double cooking!** | [ ] PASS |
| **Network Loss / SSE Disconnect** | Disconnect POS terminal from Internet | SSE detects disconnection; agent switches to scalable polling fallback (every 15–30s with backoff). When internet is restored, agent promotes back to real-time SSE automatically. | [ ] PASS |
| **Duplicate Delivery Prevention** | Same order payload received multiple times via SSE and polling | Local SQLite idempotency check matches `id` and `idempotencyKey`; duplicate payload is skipped with log note. | [ ] PASS |
| **Device Deactivation** | Manager deactivates terminal in Admin Dashboard | Server sends `device-deactivated` event; agent immediately clears device token from `safeStorage`, stops SSE/polling, and displays pairing screen. | [ ] PASS |

---

## 7. Installation & Acceptance Sign-Off

* **Restaurant Name**: ____________________________________
* **Branch Location**: ____________________________________
* **Terminal Name**: ______________________________________
* **Tested Printer Models**: ______________________________
* **Technician Name**: ____________________________________
* **Date & Signature**: ___________________________________
