# Vite Migration Walkthrough

I have successfully migrated the project from Create React App (CRA) to **Vite**.

## Changes Made

1.  **Dependencies**:
    -   Removed `react-scripts`, `craco`, and `webpack` related packages.
    -   Added `vite`, `@vitejs/plugin-react`, `vite-tsconfig-paths`.
    -   Updated `typescript` configuration.

2.  **Configuration**:
    -   Created `vite.config.ts` with transparent proxy to backend (port 3001).
    -   Updated `tsconfig.json` to support Vite types.
    -   Moved and updated `index.html` to project root (Vite standard).
    -   Created `src/vite-env.d.ts` for type safety.

3.  **Codebase Refactoring**:
    -   Updated all API and Service files (`api.ts`, `authService.ts`, etc.) to use `import.meta.env` instead of `process.env`.
    -   Renamed `REACT_APP_` environment variables to `VITE_`.
    -   Updated `scripts/gen-version.js` to generate compatible version files.

## ⚠️ Action Required

Before starting the app, you MUST:

1.  **Update your `.env` file**:
    Rename all variables starting with `REACT_APP_` to `VITE_`.
    Example:
    ```bash
    # Old
    REACT_APP_API_URL=http://localhost:3001
    
    # New
    VITE_API_URL=http://localhost:3001
    ```

2.  **Install Dependencies**:
    Run the following command in your terminal:
    ```bash
    npm install
    # or
    rm -rf node_modules package-lock.json && npm install
    ```

3.  **Start the App**:
    ```bash
    npm start
    ```
