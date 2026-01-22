# Frontend Test Specification (Manual Testing)
Project: Smart Energy Monitor Version: 2.0
Scope: User Interface, User Experience, Data Visualization, and Admin Functions.
Target URL: http://localhost:5173/

🛠 Prerequisites
- **Browser**: Chrome, Edge, or Firefox (Latest Version).
- **Backend**: Must be running on `http://localhost:3001` (Verified via Backend Test Spec).
- **Credentials**:
  - **Username**: `admin`
  - **Password**: `admin123`

---

## 1. Authentication & Session Management
**Objective**: Verify secure access and session handling.

### Test Case 1.1: Admin Login
1. Navigate to `http://localhost:5173/login`.
2. Enter Username: `admin` and Password: `admin123`.
3. Click "Sign In".
4. **Pass Criteria**: redirected to `/dashboard`. "Login Successful" toast notification appears.

### Test Case 1.2: Session Persistence
1. After login, refresh the page (F5).
2. **Pass Criteria**: User remains logged in. Dashboard loads without redirecting to login.

### Test Case 1.3: Logout
1. Click the User Avatar (Top Right).
2. Select "Sign out".
3. **Pass Criteria**: Redirected to `/login`. LocalStorage/Cookies cleared (Check Application tab in DevTools).

---

## 2. Dashboard & Real-time Monitoring
**Objective**: Verify "Built for Productivity" - instant data access and visual clarity.

### Test Case 2.1: Dashboard Layout (Desktop)
1. Navigate to `/dashboard`.
2. **Pass Criteria**:
   - Header shows "Overview" or "Smart Energy".
   - **Key Blocks visible**: Voltage, Current, Active Power, Energy Cost, Frequency, PF.
   - All blocks entered and aligned correctly. No overlapping elements.

### Test Case 2.2: Real-time Data Updates
1. Observe the **Voltage** and **Active Power** blocks for 10-30 seconds.
2. **Pass Criteria**: Values update dynamically (flashing or changing) indicating WebSocket/Interval connection is active.

### Test Case 2.3: Chart Interaction (Interactive Graphs)
1. Locate the **Real-time Power Chart** (Line chart).
2. Hover over the data points.
3. **Pass Criteria**: Tooltip appears showing specific Timestamp and Value (kW).
4. Click legend toggles (if any) to hide/show series.

### Test Case 2.4: Cost Calculation Display
1. Check **Energy Cost** block.
2. Verify "Total Cost" includes breakdown (Base Tariff, Ft, VAT).
3. **Pass Criteria**:
   - Currency symbol (฿) is present.
   - Breakdown bars are visible.
   - "Type 1.1.2" (or configured tariff) is shown.

### Test Case 2.5: Energy Accumulated Block
1. Locate **ENERGY ACCUMULATED** block.
2. Verify visual bars for Daily, Monthly, Yearly.
3. Click "Daily" bar.
4. **Pass Criteria**:
   - Detailed "Energy History Chart" popup opens.
   - Export CSV button (Download icon) is visible and clickable.
   - Meter Total (Ep_total/10) bar is present.

### Test Case 2.6: Energy Cost Details
1. Locate **ENERGY COST** block.
2. Click the Pie Chart or "See History" link.
3. **Pass Criteria**:
   - "Cost History" chart popup opens.
   - Breakdown (Base/Ft/VAT) matches the summary values.
   - Ft Rate is editable or correct (default ~0.3972).

---

## 3. Historical Data & Analytics
**Objective**: Verify data analysis tools.

### Test Case 3.1: Date Range Selection
1. Click the **Date Range Picker** (Top Right on Dashboard).
2. Select "Yesterday" or custom range.
3. **Pass Criteria**: Charts reload. Data reflects the selected period.

### Test Case 3.2: Hourly Energy Chart
1. Scroll to **Hourly Energy** (Bar Chart).
2. **Pass Criteria**:
   - Bars represent hourly consumption.
   - **Current Hour** (latest bar) exists (Cross-check Backend Test 2.2 Hybrid Data).

---

## 4. Admin & User Management
**Objective**: Verify Admin capabilities.

### Test Case 4.1: User Management Access
1. Navigate to `Settings` -> `User Management` (or URL `/admin/users`).
2. **Pass Criteria**: Table of users loads. "Add User" button visible.

### Test Case 4.2: Edit User
1. Click "Edit" icon on a user row.
2. Change "Display Name". Click Save.
3. **Pass Criteria**: Toast success. Name updated in the table immediately.

---

## 5. System Settings & Notifications
**Objective**: Verify configuration tools.

### Test Case 5.1: LINE Notification Settings
1. Navigate to `Settings` -> `LINE Configuration`.
2. **Pass Criteria**: Form loads current Token/Settings.
3. Try toggling "Enable Notifications". Click Save.
4. **Pass Criteria**: "Settings Updated" success message.

---

## 6. Responsive Design (Mobile Experience)
**Objective**: Verify "Beyond Desktop" - mobile usability.

### Test Case 6.1: Mobile Layout (Simulation)
1. Open DevTools (F12) -> Toggle Device Toolbar (Ctrl+Shift+M).
2. Select "iPhone 12" or "Pixel 5".
3. **Pass Criteria**:
   - Menu becomes a Hamburger icon or Bottom Navigation.
   - Dashboard blocks stack vertically (1 column).
   - Charts remain visible and fit within screen width (No horizontal scrollbar on body).

### Test Case 6.2: Mobile Menu Navigation
1. Click the Hamburger Menu.
2. Navigate to "Status" or "Alerts".
3. **Pass Criteria**: Smooth transition. Menu closes after selection (if applicable).

---

## 📝 Test Execution Notes
- **Browser used**: _______________________
- **Tester**: _____________________________
- **Date**: _______________________________

**Productivity Check**:
- [ ] Is the UI snappy? (Load times < 2s)
- [ ] Is important info (Cost/Power) immediately visible?
- [ ] Are interactions (Hover, Click) providing feedback?
