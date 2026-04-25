/**
 * electron-builder.config.js
 *
 * Packaging configuration for Windows, macOS, and Linux.
 * The Python sidecar binary is bundled under resources/python/
 * so electron-builder will include it in every target platform's package.
 */

/** @type {import('electron-builder').Configuration} */
const config = {
  // ── App metadata ──────────────────────────────────────────────────────────
  appId: "com.pdfreader.pro",
  productName: "PDF Reader Pro",
  copyright: `Copyright © ${new Date().getFullYear()} PDF Reader Pro`,

  // ── Directories ──────────────────────────────────────────────────────────
  directories: {
    // electron-vite outputs compiled main/preload/renderer here
    output: "release",
    buildResources: "resources",
  },

  // ── Files to include ─────────────────────────────────────────────────────
  files: [
    // electron-vite builds go here
    "dist-electron/**/*",
    "dist/**/*",
    // Python sidecar bundled as an extra resource (see extraResources below)
    "!python/**/*", // exclude raw Python source from asar
    "!node_modules/**/*",
  ],

  // ── Extra resources (outside the asar archive) ───────────────────────────
  // The Python folder is bundled separately so the OS can actually execute it.
  // At runtime, access via: process.resourcesPath + '/python'
  extraResources: [
    {
      from: "python/",
      to: "python/",
      filter: ["**/*", "!__pycache__/**", "!*.pyc", "!.venv/**"],
    },
  ],

  // ── Windows ───────────────────────────────────────────────────────────────
  win: {
    target: [
      {
        target: "nsis",  // creates a standard Windows installer (.exe)
        arch: ["x64"],
      },
      {
        target: "portable", // standalone .exe — no install required
        arch: ["x64"],
      },
    ],
    icon: "resources/icon.ico",
    // Code signing (optional — set env vars CSC_LINK + CSC_KEY_PASSWORD)
    // certificateFile: process.env.CSC_LINK,
    // certificatePassword: process.env.CSC_KEY_PASSWORD,
  },

  nsis: {
    oneClick: false,           // show installer wizard
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "PDF Reader Pro",
    installerIcon: "resources/icon.ico",
    uninstallerIcon: "resources/icon.ico",
  },

  // ── macOS ─────────────────────────────────────────────────────────────────
  mac: {
    target: [
      { target: "dmg", arch: ["x64", "arm64"] }, // Intel + Apple Silicon
    ],
    icon: "resources/icon.icns",
    category: "public.app-category.productivity",
    // hardenedRuntime + entitlements required for notarization
    hardenedRuntime: true,
    entitlements: "resources/entitlements.mac.plist",
    entitlementsInherit: "resources/entitlements.mac.plist",
  },

  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
  },

  // ── Linux ─────────────────────────────────────────────────────────────────
  linux: {
    target: ["AppImage", "deb", "rpm"],
    icon: "resources/icon.png",
    category: "Office",
    maintainer: "PDF Reader Pro",
  },

  // ── Publish (GitHub Releases — used by electron-updater) ─────────────────
  // Uncomment and fill in `owner` + `repo` to enable auto-updates via GH.
  // publish: {
  //   provider: "github",
  //   owner: "your-github-username",
  //   repo: "pdf-reader-pro",
  // },
};

module.exports = config;
