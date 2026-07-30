/**
 * Attach GymSync.storekit to the Xcode scheme's Run action.
 *
 * Without this, StoreKit in the simulator talks to the real App Store, finds no
 * products (there are none — the app isn't in App Store Connect yet), and the
 * paywall's buy button stays disabled forever.
 *
 * Written as a config plugin rather than a script you must remember to run:
 * `expo prebuild` regenerates the scheme from scratch, so any manual step here
 * is one you'd silently skip and then spend an hour debugging. This runs inside
 * prebuild, every time.
 *
 * The reference is relative to the .xcscheme, which lives at
 * ios/GymSync.xcodeproj/xcshareddata/xcschemes/ — four levels below the repo
 * root, hence "../../../../GymSync.storekit". The file is kept at the root
 * because ios/ is gitignored and wiped by prebuild.
 *
 * expo-iap's own plugin does NOT do this — it only touches entitlements for
 * alternative billing.
 */
const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const STOREKIT_FILE = 'GymSync.storekit';
const RELATIVE_REFERENCE = `../../../../${STOREKIT_FILE}`;

function attachToScheme(schemePath) {
  let scheme = fs.readFileSync(schemePath, 'utf8');

  if (scheme.includes('StoreKitConfigurationFileReference')) {
    // Already attached. Rewrite the identifier anyway so a renamed or moved
    // config file doesn't leave a dangling reference behind.
    return scheme.replace(
      /identifier = "[^"]*\.storekit"/,
      `identifier = "${RELATIVE_REFERENCE}"`,
    );
  }

  // Xcode expects the reference INSIDE <LaunchAction>. Anchor on the closing
  // tag rather than the opening one: LaunchAction's attribute list varies
  // between Xcode versions, and its children do not.
  // Matched with its leading indentation so the inserted block can reuse it,
  // rather than stacking the existing indent on top of its own.
  const marker = /([ \t]*)<\/LaunchAction>/;
  if (!marker.test(scheme)) {
    throw new Error(`No <LaunchAction> in ${schemePath} — cannot attach StoreKit config.`);
  }

  return scheme.replace(marker, (_full, indent) =>
    [
      `${indent}   <StoreKitConfigurationFileReference`,
      `${indent}      identifier = "${RELATIVE_REFERENCE}">`,
      `${indent}   </StoreKitConfigurationFileReference>`,
      `${indent}</LaunchAction>`,
    ].join('\n'),
  );
}

module.exports = function withStoreKitConfig(config) {
  return withXcodeProject(config, (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const iosRoot = cfg.modRequest.platformProjectRoot;
    const projectName = cfg.modRequest.projectName;

    // Fail loudly rather than producing a build that silently can't purchase.
    const source = path.join(projectRoot, STOREKIT_FILE);
    if (!fs.existsSync(source)) {
      throw new Error(
        `${STOREKIT_FILE} not found at the repo root. Run: node tools/generate-storekit.mjs`,
      );
    }

    const schemePath = path.join(
      iosRoot,
      `${projectName}.xcodeproj`,
      'xcshareddata',
      'xcschemes',
      `${projectName}.xcscheme`,
    );
    if (!fs.existsSync(schemePath)) {
      throw new Error(`Scheme not found at ${schemePath}`);
    }

    fs.writeFileSync(schemePath, attachToScheme(schemePath));
    return cfg;
  });
};
